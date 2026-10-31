// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.infra.dal.dataobject.file.FileDO;
import cn.iocoder.yudao.module.infra.dal.mysql.file.FileMapper;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * `infra_file` 的四道门：分页后过滤并重算 total、按 id 读扣下别人的行、单条删除只认创建者、批量删除逐行只认创建者。
 * 文件行没有属主列——属主是审计串 `creator`——故分页是**模块答完之后**再过滤，删除的归属要在写跑起来之前回答。
 *
 * <p>Four doors for `infra_file`: the page filtered after the module answers with its total recomputed, another's
 * row withheld from a read by id, the single delete accepting only the creator, and the bulk delete checking every
 * row. The file table has no owner column — the owner is the audit string `creator` — so the page is filtered after
 * the module answers and the delete's ownership is answered before the write runs.
 */
class InfraFileGovernanceTest {

    private static final long CALLER = 42L;

    private YudaoModuleScope scope;
    private FileMapper mapper;
    private InfraFileGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        scope = mock(YudaoModuleScope.class);
        mapper = mock(FileMapper.class);
        aspect = new InfraFileGovernance(scope, mapper);
        call = mock(ProceedingJoinPoint.class);
        when(scope.callerToEnforce()).thenReturn(CALLER);
    }

    @Test
    void thePageKeepsOnlyTheCallersFilesAndResizes() throws Throwable {
        FileDO mine = file(1L, "42");
        FileDO theirs = file(2L, "7");
        when(scope.belongsToCaller("42", CALLER)).thenReturn(true);
        when(scope.belongsToCaller("7", CALLER)).thenReturn(false);
        when(call.proceed()).thenReturn(new PageResult<>(List.of(mine, theirs), 2L));

        @SuppressWarnings("unchecked")
        PageResult<FileDO> page = (PageResult<FileDO>) aspect.narrowToCaller(call);

        assertEquals(List.of(1L), page.getList().stream().map(FileDO::getId).toList());
        assertEquals(1L, page.getTotal(), "the total describes the rows this page kept, not the table");
    }

    @Test
    void withNoCallerThePageIsReturnedAsItCame() throws Throwable {
        when(scope.callerToEnforce()).thenReturn(null);
        PageResult<FileDO> original = new PageResult<>(List.of(file(2L, "7")), 1L);
        when(call.proceed()).thenReturn(original);

        assertSame(original, aspect.narrowToCaller(call));
    }

    @Test
    void anOutcomeThatIsNotAPageIsLeftAlone() throws Throwable {
        when(call.proceed()).thenReturn("something else");

        assertEquals("something else", aspect.narrowToCaller(call));
    }

    @Test
    void aReadByIdHandsAnothersFileBackAsNothing() throws Throwable {
        when(scope.belongsToCaller("7", CALLER)).thenReturn(false);
        when(call.proceed()).thenReturn(file(2L, "7"));

        assertNull(aspect.withholdOthersRow(call));
    }

    @Test
    void aReadByIdReturnsTheCallersOwnFile() throws Throwable {
        FileDO mine = file(1L, "42");
        when(scope.belongsToCaller("42", CALLER)).thenReturn(true);
        when(call.proceed()).thenReturn(mine);

        assertSame(mine, aspect.withholdOthersRow(call));
    }

    @Test
    void aDeleteOfAnothersFileIsRefusedBeforeItRuns() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{9L});
        when(mapper.selectById(9L)).thenReturn(file(9L, "7"));
        doThrow(new RuleDeniedException(null, "该行不在你的数据范围内", "File", "delete", null))
                .when(scope).requireOwned("7", CALLER, "File", "delete");

        assertThrows(RuleDeniedException.class, () -> aspect.requireOwnership(call));
        verify(call, never()).proceed();
    }

    @Test
    void aDeleteOfTheCallersOwnFileProceeds() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{9L});
        when(mapper.selectById(9L)).thenReturn(file(9L, "42"));

        aspect.requireOwnership(call);

        verify(scope).requireOwned("42", CALLER, "File", "delete");
        verify(call).proceed();
    }

    @Test
    void aDeleteOfAMissingRowIsLeftToTheModule() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{9L});
        when(mapper.selectById(9L)).thenReturn(null);

        aspect.requireOwnership(call);

        verify(scope).requireOwned(null, CALLER, "File", "delete");
        verify(call).proceed();
    }

    @Test
    void aBulkDeleteIsRefusedWhenAnyRowIsNotTheCallers() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{List.of(1L, 2L)});
        when(mapper.selectByIds(List.of(1L, 2L))).thenReturn(List.of(file(1L, "42"), file(2L, "7")));
        doThrow(new RuleDeniedException(null, "该行不在你的数据范围内", "File", "delete", null))
                .when(scope).requireOwned("7", CALLER, "File", "delete");

        assertThrows(RuleDeniedException.class, () -> aspect.requireOwnershipOfEveryRow(call));
        verify(call, never()).proceed();
    }

    @Test
    void aBulkDeleteOfTheCallersOwnFilesProceeds() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{List.of(1L, 2L)});
        when(mapper.selectByIds(List.of(1L, 2L))).thenReturn(List.of(file(1L, "42"), file(2L, "42")));

        aspect.requireOwnershipOfEveryRow(call);

        verify(scope, times(2)).requireOwned("42", CALLER, "File", "delete");
        verify(call).proceed();
    }

    @Test
    void aBulkDeleteWithNoIdsDoesNotQueryTheTable() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{List.of()});

        aspect.requireOwnershipOfEveryRow(call);

        verify(mapper, never()).selectByIds(any());
        verify(call).proceed();
    }

    @Test
    void theModuleDeclaresItselfAndTheColumnItReads() {
        assertEquals("infra", aspect.module());
        assertEquals("creator", aspect.ownerField());
    }

    private static FileDO file(long id, String creator) {
        FileDO row = new FileDO();
        row.setId(id);
        row.setCreator(creator);
        return row;
    }
}
