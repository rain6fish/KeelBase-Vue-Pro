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
import cn.iocoder.yudao.module.system.controller.admin.notice.vo.NoticeSaveReqVO;
import cn.iocoder.yudao.module.system.dal.dataobject.notice.NoticeDO;
import cn.iocoder.yudao.module.system.service.notice.NoticeService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 公告工具面的四件事：**列**（最新在前、六个字段）、**新建**（结果带 id、状态缺省为开启）、**缺必填即失败**、
 * **路由从文字里读出三个必填项**。
 *
 * <p>The four things the notice face does: list (newest first, six fields), create (the result carries
 * an id, status defaults to enabled), fail loudly when a required value is missing, and read the three
 * required values out of the caller's own words on the route.
 */
class SystemNoticeToolsTest {

    private static final String CALLER = "42";

    private NoticeService service;
    private SystemNoticeTools.ListTool listTool;
    private SystemNoticeTools.CreateTool createTool;

    @BeforeEach
    void setUp() {
        service = mock(NoticeService.class);
        listTool = new SystemNoticeTools.ListTool(service);
        createTool = new SystemNoticeTools.CreateTool(service);
    }

    @Test
    @SuppressWarnings("unchecked")
    void theListProjectsSixFieldsNewestFirst() {
        when(service.getNoticePage(any())).thenReturn(new PageResult<>(List.of(notice(1L)), 1L));

        ToolResult result = listTool.execute(Map.of(), caller());

        assertTrue(result.success());
        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.data();
        assertEquals(1, rows.size());
        assertEquals(List.of("id", "title", "type", "status", "content", "createTime"),
                List.copyOf(rows.get(0).keySet()));
        verify(service).getNoticePage(any());
    }

    @Test
    void createCarriesTheNewIdBackAndDefaultsToEnabled() {
        when(service.createNotice(any())).thenReturn(99L);

        ToolResult result = createTool.execute(
                Map.of("title", "系统维护", "type", 1, "content", "今晚 22:00 停机"), caller());

        assertTrue(result.success());
        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(99L, out.get("id"));

        ArgumentCaptor<NoticeSaveReqVO> saved = ArgumentCaptor.forClass(NoticeSaveReqVO.class);
        verify(service).createNotice(saved.capture());
        assertEquals("系统维护", saved.getValue().getTitle());
        assertEquals(Integer.valueOf(1), saved.getValue().getType());
        assertEquals("今晚 22:00 停机", saved.getValue().getContent());
        assertEquals(Integer.valueOf(0), saved.getValue().getStatus(),
                "publishing means enabled unless the caller says otherwise");
    }

    @Test
    void aDraftKeepsTheStatusTheCallerNamed() {
        when(service.createNotice(any())).thenReturn(100L);

        createTool.execute(Map.of("title", "草稿", "type", 2, "content", "待审", "status", 1), caller());

        ArgumentCaptor<NoticeSaveReqVO> saved = ArgumentCaptor.forClass(NoticeSaveReqVO.class);
        verify(service).createNotice(saved.capture());
        assertEquals(Integer.valueOf(1), saved.getValue().getStatus());
    }

    @Test
    void aCreateWithoutItsRequiredValuesFailsRatherThanGuessing() {
        assertFalse(createTool.execute(Map.of("type", 1, "content", "正文"), caller()).success(),
                "a notice without a title is not a notice");
        assertFalse(createTool.execute(Map.of("title", "标题", "content", "正文"), caller()).success(),
                "the type says whether this is a notice or an announcement");
        assertFalse(createTool.execute(Map.of("title", "标题", "type", 1), caller()).success(),
                "an empty body is not an announcement");
    }

    @Test
    void theRouteReadsTheThreeRequiredValuesOutOfTheText() {
        assertEquals("create_notice", createTool.name());
        Map<String, Object> args = new SystemNoticeTools.CreateRoute().args(Map.of(
                "message", "发布公告 标题=系统维护 类型=1 内容=今晚 22:00 停机 状态=1"));

        assertEquals("系统维护", args.get("title"));
        assertEquals("1", args.get("type"));
        assertEquals("今晚 22:00 停机", args.get("content"));
        assertEquals("1", args.get("status"));
    }

    @Test
    void aMessageWithoutTheKeysYieldsNoArgumentsSoTheEngineRefusesBeforeAHumanIsAsked() {
        Map<String, Object> args = new SystemNoticeTools.CreateRoute().args(Map.of("message", "发个公告"));

        assertTrue(args.isEmpty(), "the engine reports invalid_arguments rather than holding a half proposal");
    }

    @Test
    void theFacesDeclareTheirContract() {
        assertEquals("list_notices", listTool.name());
        assertEquals("R1", listTool.riskLevel());
        assertTrue(listTool.parameters().isEmpty(), "a broadcast has no 'which part' to ask for");
        assertEquals("create_notice", createTool.name());
        assertEquals("R3", createTool.riskLevel());
        assertEquals("system_notice", createTool.resultType());
        assertEquals(4, createTool.parameters().size());
    }

    private static NoticeDO notice(long id) {
        NoticeDO row = new NoticeDO();
        row.setId(id);
        row.setTitle("维护公告");
        row.setType(1);
        row.setStatus(0);
        row.setContent("今晚停机");
        row.setCreateTime(LocalDateTime.of(2026, 10, 31, 9, 0));
        return row;
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }
}
