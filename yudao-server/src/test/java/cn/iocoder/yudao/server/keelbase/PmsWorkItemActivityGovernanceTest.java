// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static cn.iocoder.yudao.framework.common.exception.util.ServiceExceptionUtil.exception;
import static cn.iocoder.yudao.module.pms.enums.ErrorCodeConstants.PROJECT_ACCESS_DENIED;
import static cn.iocoder.yudao.module.pms.enums.ErrorCodeConstants.WORK_ITEM_NOT_EXISTS;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.iocoder.yudao.module.pms.dal.dataobject.pm.workitem.PmsWorkItemActivityDO;
import cn.iocoder.yudao.module.pms.dal.dataobject.pm.workitem.PmsWorkItemDO;
import cn.iocoder.yudao.module.pms.service.pm.workitem.PmsWorkItemService;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 工作项动态的切面：工具路径上先判工作项可读，别人的与不存在的**同一个答案**；请求路径原样放行。
 *
 * <p>这里钉四件事：① 没有行动调用方（请求路径 / 超级管理员 / 全行范围）时连工作项都不去问；② 判不过时交回空表，且
 * **不去读动态**；③ 判得过时原样放行并交回模块的结果；④ 实参形状变了就放行而不是猜。
 *
 * <p>The work-item feed aspect: on the tool path the work item is checked first, and another's work item answers exactly
 * like a missing one. Four things are pinned — with no acting caller (request path, super administrator, every-row
 * scope) the work item is never even asked about; a refused check returns an empty list **without reading the feed**; an
 * accepted one proceeds and hands back the module's result; a changed argument shape passes through rather than being
 * guessed.
 */
class PmsWorkItemActivityGovernanceTest {

    private static final long CALLER_ID = 42L;

    private YudaoModuleScope scope;
    private PmsWorkItemService workItems;
    private PmsWorkItemActivityGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        scope = mock(YudaoModuleScope.class);
        workItems = mock(PmsWorkItemService.class);
        aspect = new PmsWorkItemActivityGovernance(scope, workItems);
        call = mock(ProceedingJoinPoint.class);
    }

    @Test
    void theRequestPathIsLeftAlone() throws Throwable {
        when(scope.callerToEnforce()).thenReturn(null);
        when(call.proceed()).thenReturn("feed");

        assertEquals("feed", aspect.withholdOtherProjectsFeed(call));
        verify(workItems, never()).getWorkItem(any(), any());
    }

    @Test
    void aCallerWhoseScopeIsEveryRowIsLeftAlone() throws Throwable {
        // 超级管理员与「角色声明全部行」的调用方由 YudaoModuleScope 判成 null，本切面不再问第二个问题。
        // The super administrator and every-row callers are already null from YudaoModuleScope; the advice asks nothing.
        when(scope.callerToEnforce()).thenReturn(null);
        when(call.proceed()).thenReturn("feed");

        assertEquals("feed", aspect.withholdOtherProjectsFeed(call));
        verify(workItems, never()).getWorkItem(any(), any());
    }

    @Test
    void anotherProjectsWorkItemIsTheSameAnswerAsAMissingOne() throws Throwable {
        when(scope.callerToEnforce()).thenReturn(CALLER_ID);
        when(workItems.getWorkItem(eq(7L), eq(CALLER_ID)))
                .thenThrow(exception(PROJECT_ACCESS_DENIED));
        when(workItems.getWorkItem(eq(8L), eq(CALLER_ID)))
                .thenThrow(exception(WORK_ITEM_NOT_EXISTS));

        Object theirs = adviceOn(7L);
        Object missing = adviceOn(8L);

        assertEquals(List.of(), theirs, "another project's work item answers with nothing");
        assertEquals(theirs, missing, "and that is byte for byte the answer a missing work item gets");
        verify(call, never()).proceed();
    }

    @Test
    void aReadableWorkItemProceedsAndHandsBackTheModuleResult() throws Throwable {
        PmsWorkItemDO workItem = new PmsWorkItemDO();
        workItem.setId(7L);
        when(scope.callerToEnforce()).thenReturn(CALLER_ID);
        when(workItems.getWorkItem(7L, CALLER_ID)).thenReturn(workItem);
        PmsWorkItemActivityDO row = new PmsWorkItemActivityDO();
        row.setId(1L);
        when(call.getArgs()).thenReturn(new Object[]{7L});
        when(call.proceed()).thenReturn(List.of(row));

        Object result = aspect.withholdOtherProjectsFeed(call);

        assertEquals(List.of(row), result);
        verify(workItems).getWorkItem(7L, CALLER_ID);
    }

    @Test
    void aChangedArgumentShapePassesThroughRatherThanBeingGuessed() throws Throwable {
        when(scope.callerToEnforce()).thenReturn(CALLER_ID);
        when(call.getArgs()).thenReturn(new Object[]{"not-an-id"});
        when(call.proceed()).thenReturn("unchanged");

        assertEquals("unchanged", aspect.withholdOtherProjectsFeed(call));
        verify(workItems, never()).getWorkItem(any(), any());
    }

    @Test
    void theModuleDeclaresItselfAndHasNoOwnerColumn() {
        assertEquals("pms", aspect.module());
        assertTrue(aspect.ownerField().startsWith("none"),
                "the audience is the work item's project; there is no column for the advice to read");
    }

    /** Runs the advice for one work-item id, the way the tool path does. */
    private Object adviceOn(Long workItemId) throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{workItemId});
        return aspect.withholdOtherProjectsFeed(call);
    }
}
