// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.infra.dal.dataobject.file.FileDO;
import cn.iocoder.yudao.module.infra.service.file.FileService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 文件工具面的三件事：**列**出去的只有业务元数据（不含 path / url / configId，也不含审计串）、**删**的结果带
 * 它删掉的那个 id、**缺 id 即失败**。
 *
 * <p><b>投影为什么非钉不可。</b>真栈上看不见它 —— 核心 `chat-response` 不带 `data`，故
 * `run-infra-file-scenarios.mjs` 只能断言模块那一行，并把这个字段集指到这里。管理端红线要求输出不外泄身份与
 * 存储细节，而不给 path / url / configId，也就拼不出那条 `@PermitAll` 的下载地址；这一条靠的就是本测试。
 *
 * <p>The three things the file face does: the list projects **business metadata only** (no path, URL or
 * config id, and no audit string), a delete's result names the id it removed, and a delete without an id
 * fails rather than guessing.
 *
 * <p><b>Why the projection has to be pinned here.</b> The real stack cannot show it — core's
 * `chat-response` carries no `data`, so `run-infra-file-scenarios.mjs` asserts the module's row and points
 * this field set here. The admin red line forbids leaking identity and storage details, and without path /
 * URL / config id the `@PermitAll` download address cannot be composed; this test is what holds that.
 */
class InfraFileToolsTest {

    private static final String CALLER = "42";

    private FileService service;
    private InfraFileTools.ListTool listTool;
    private InfraFileTools.DeleteTool deleteTool;

    @BeforeEach
    void setUp() {
        service = mock(FileService.class);
        listTool = new InfraFileTools.ListTool(service);
        deleteTool = new InfraFileTools.DeleteTool(service);
    }

    @Test
    @SuppressWarnings("unchecked")
    void theListProjectsBusinessMetadataOnly() {
        when(service.getFilePage(any())).thenReturn(new PageResult<>(List.of(file(7L)), 1L));

        ToolResult result = listTool.execute(Map.of(), caller());

        assertTrue(result.success());
        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.data();
        assertEquals(1, rows.size());
        assertEquals(List.of("id", "name", "size", "type", "createTime"),
                List.copyOf(rows.get(0).keySet()),
                "the projection is the business fact only");
        for (String hidden : List.of("path", "url", "configId", "creator")) {
            assertFalse(rows.get(0).containsKey(hidden),
                    "'" + hidden + "' must not leave this face — it composes the @PermitAll download address");
        }
        verify(service).getFilePage(any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void theDeleteCarriesTheIdItRemoved() throws Exception {
        ToolResult result = deleteTool.execute(Map.of("id", 7), caller());

        assertTrue(result.success());
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(7L, out.get("id"), "the ledger needs the id this write landed on");
        assertEquals(true, out.get("deleted"));
        verify(service).deleteFile(7L);
    }

    @Test
    void aDeleteWithoutAnIdFailsRatherThanGuessing() {
        assertFalse(deleteTool.execute(Map.of(), caller()).success(), "a delete without an id names nothing");
        assertFalse(deleteTool.execute(Map.of("id", "abc"), caller()).success(),
                "an id that is not a number is not an id");
    }

    @Test
    void theRouteReadsTheTargetSlot() {
        assertEquals(Map.of(), new InfraFileTools.ListRoute().args(Map.of("targetId", 7)),
                "the read is narrowed by the advice, so the route adds nothing");
        assertEquals(Map.of("id", 7), new InfraFileTools.DeleteRoute().args(Map.of("targetId", 7)));
        assertEquals(Map.of(), new InfraFileTools.DeleteRoute().args(Map.of()));
    }

    @Test
    void theFacesDeclareTheirContract() {
        assertEquals("list_my_infra_files", listTool.name());
        assertEquals("R1", listTool.riskLevel());
        assertTrue(listTool.parameters().isEmpty(), "the page VO has no caller filter to expose as an argument");
        assertEquals("delete_infra_file", deleteTool.name());
        assertEquals("R3", deleteTool.riskLevel());
        assertEquals("infra_file", deleteTool.resultType());
        assertEquals(1, deleteTool.parameters().size());
    }

    private static FileDO file(long id) {
        FileDO row = new FileDO();
        row.setId(id);
        row.setName("gate.txt");
        row.setSize(5L);
        row.setType("text/plain");
        row.setCreateTime(LocalDateTime.of(2026, 11, 2, 9, 0));
        // 模块那一行**是**带着这些的 —— 投影的职责就是不让它们出去。
        // The module's row **does** carry these — keeping them from leaving is exactly the projection's job.
        row.setPath("gate/gate.txt");
        row.setUrl("http://gate.invalid/gate/gate.txt");
        row.setConfigId(4L);
        row.setCreator(CALLER);
        return row;
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }
}
