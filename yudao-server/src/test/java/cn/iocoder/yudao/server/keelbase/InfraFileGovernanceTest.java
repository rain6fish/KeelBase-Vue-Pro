// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.infra.dal.dataobject.file.FileDO;
import cn.iocoder.yudao.module.infra.dal.mysql.file.FileMapper;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.Signature;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 文件切面的三条进门路径：分页后过滤并重算 total、按 id 读交回空、删除只认创建者。
 *
 * <p>为什么 total 要单列一条：文件没有属主列，切面只能在模块答完之后过滤，故那个 total 是**本页的**——把它写在
 * 断言里，是为了让「它哪天被谁改成全表数」当场红。
 *
 * <p>Three doors into the file rows: the page is filtered after the module answers (with `total` recomputed), a read
 * by id comes back empty for another's row, and a delete is for the creator only. The total gets its own test because
 * the file table has no owner column, so the number can only be this page's — pinning it here makes any later attempt
 * to pass it off as a table count go red.
 */
class InfraFileGovernanceTest {

    private static final long CALLER = 42L;

    private YudaoModuleScope scope;
    private FileMapper files;
    private InfraFileGovernance aspect;
    private ProceedingJoinPoint call;

    @BeforeEach
    void setUp() {
        scope = mock(YudaoModuleScope.class);
        files = mock(FileMapper.class);
        aspect = new InfraFileGovernance(scope, files);
        call = mock(ProceedingJoinPoint.class);
        when(scope.callerToEnforce()).thenReturn(CALLER);
    }

    @Test
    void thePageKeepsOnlyTheCallersRowsAndCountsThisPage() throws Throwable {
        PageResult<FileDO> page = new PageResult<>(List.of(file(1L, "42"), file(2L, "99")), 2L);
        when(call.proceed()).thenReturn(page);

        @SuppressWarnings("unchecked")
        PageResult<FileDO> narrowed = (PageResult<FileDO>) aspect.narrowToCaller(call);

        assertEquals(1, narrowed.getList().size(), "another caller's row must not survive the page");
        assertEquals(1L, narrowed.getTotal(), "the total is this page's kept rows, not the table's count");
        assertEquals(1L, narrowed.getList().get(0).getId());
    }

    @Test
    void withNoCallerThePageIsUntouched() throws Throwable {
        when(scope.callerToEnforce()).thenReturn(null);
        PageResult<FileDO> page = new PageResult<>(List.of(file(1L, "42"), file(2L, "99")), 2L);
        when(call.proceed()).thenReturn(page);

        assertSame(page, aspect.narrowToCaller(call), "a REST request keeps the module's own answer");
    }

    @Test
    void anothersFileIsHandedBackAsNothing() throws Throwable {
        when(call.proceed()).thenReturn(file(2L, "99"));

        assertNull(aspect.withholdOthersRow(call), "not yours answers the way not-there answers");
    }

    @Test
    void theCallersOwnFileComesBack() throws Throwable {
        FileDO mine = file(1L, "42");
        when(call.proceed()).thenReturn(mine);

        assertSame(mine, aspect.withholdOthersRow(call));
    }

    @Test
    void aDeleteNeedsTheCreator() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{2L});
        Signature signature = signature("deleteFile");
        when(call.getSignature()).thenReturn(signature);
        when(files.selectById(2L)).thenReturn(file(2L, "99"));

        assertThrows(RuleDeniedException.class, () -> aspect.requireCreator(call),
                "only the creator may delete a file");
    }

    @Test
    void aBatchDeleteIsRefusedWholeWhenOneRowIsForeign() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{List.of(1L, 2L)});
        Signature signature = signature("deleteFileList");
        when(call.getSignature()).thenReturn(signature);
        when(files.selectById(1L)).thenReturn(file(1L, "42"));
        when(files.selectById(2L)).thenReturn(file(2L, "99"));

        assertThrows(RuleDeniedException.class, () -> aspect.requireCreator(call),
                "one foreign row refuses the whole batch");
    }

    @Test
    void aDeleteOfTheCallersOwnFileProceeds() throws Throwable {
        when(call.getArgs()).thenReturn(new Object[]{1L});
        Signature signature = signature("deleteFile");
        when(call.getSignature()).thenReturn(signature);
        when(files.selectById(1L)).thenReturn(file(1L, "42"));
        when(call.proceed()).thenReturn("deleted");

        assertEquals("deleted", aspect.requireCreator(call));
    }

    private static FileDO file(Long id, String creator) {
        FileDO row = new FileDO();
        row.setId(id);
        row.setCreator(creator);
        row.setName("f" + id);
        return row;
    }

    private static Signature signature(String name) {
        Signature signature = mock(Signature.class);
        when(signature.getName()).thenReturn(name);
        return signature;
    }
}
