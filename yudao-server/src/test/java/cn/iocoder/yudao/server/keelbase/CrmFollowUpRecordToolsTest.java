// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.module.crm.dal.dataobject.followup.CrmFollowUpRecordDO;
import cn.iocoder.yudao.module.crm.service.followup.CrmFollowUpRecordService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 跟进记录工具面的四件事：**按编号问一行**、**没有这一行就答没有（与别人的行同一个答案）**、**投影是整份允许清单、
 * 不带身份也不带指向别的行的指针**，以及**没有本地调用方时不碰任何数据**；另验路由的触发词与抽取。
 *
 * <p>Four things the follow-up-record face does: ask for one row by its id, answer "none" when there is no such row
 * (the same answer as for someone else's), project the whole allow-list without identity or pointers to other rows,
 * and touch no data when no local caller can be named; plus the route's triggers and identifier extraction.
 */
class CrmFollowUpRecordToolsTest {

    private static final String CALLER = "42";

    private CrmFollowUpRecordService service;
    private CrmFollowUpRecordTools.RecordReadTool tool;

    @BeforeEach
    void setUp() {
        service = mock(CrmFollowUpRecordService.class);
        tool = new CrmFollowUpRecordTools.RecordReadTool(service);
    }

    @Test
    void theReadAsksByTheRecordIdItWasGiven() {
        when(service.getFollowUpRecord(600L)).thenReturn(record());

        assertTrue(tool.execute(Map.of("recordId", "600"), caller()).success());
        verify(service).getFollowUpRecord(600L);
    }

    @Test
    void aMissingRowIsAnsweredAsMissing() {
        when(service.getFollowUpRecord(404L)).thenReturn(null);

        ToolResult result = tool.execute(Map.of("recordId", "404"), caller());

        assertTrue(result.success());
        assertEquals(Map.of("hasRecord", false), result.data(),
                "another person's row and a missing row must be the same answer");
    }

    @Test
    void noIdentifierIsARequestFailureAndTouchesNoData() {
        ToolResult result = tool.execute(Map.of(), caller());

        assertFalse(result.success());
        assertEquals("give a follow-up record id (recordId)", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void aNonNumericIdentifierIsARequestFailureAndTouchesNoData() {
        ToolResult result = tool.execute(Map.of("recordId", "not-a-number"), caller());

        assertFalse(result.success());
        assertEquals("give a follow-up record id (recordId)", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void aCallerWithoutALocalUserIdTouchesNoData() {
        ToolResult result = tool.execute(Map.of("recordId", "600"),
                new Principal(null, Principal.ROLE_USER));

        assertFalse(result.success());
        assertEquals("there is no local caller to ask about", result.error());
        verifyNoInteractions(service);
    }

    @Test
    void theProjectionCarriesTheBusinessFactButNoIdentityAndNoPointers() {
        when(service.getFollowUpRecord(600L)).thenReturn(record());

        ToolResult result = tool.execute(Map.of("recordId", "600"), caller());

        @SuppressWarnings("unchecked")
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(List.of("hasRecord", "recordId", "bizType", "bizId", "type", "content", "nextTime", "createTime"),
                List.copyOf(out.keySet()),
                "the projection is the whole allow-list — identity and linked row ids must not reappear");
        assertEquals(Boolean.TRUE, out.get("hasRecord"));
        assertEquals(600L, out.get("recordId"));
        assertEquals(2, out.get("bizType"));
        assertEquals(5564L, out.get("bizId"));
        assertEquals(1, out.get("type"));
        assertEquals("拜访-CRM 跟进", out.get("content"));
        assertFalse(out.containsKey("creator"));
        assertFalse(out.containsKey("updater"));
        assertFalse(out.containsKey("contactIds"));
        assertFalse(out.containsKey("businessIds"));
        assertFalse(out.containsKey("fileUrls"));
    }

    @Test
    void theRouteExtractsTheNumberAndTakesTheStructuredSlot() {
        CrmFollowUpRecordTools.RecordRoute route = new CrmFollowUpRecordTools.RecordRoute();

        assertEquals("get_crm_followup_record", route.toolName());
        assertEquals("600", route.args(Map.of("message", "查一条跟进 600")).get("recordId"));
        assertEquals("777", route.args(Map.of("targetId", "777")).get("recordId"),
                "with no words naming an identifier, the structured slot is the only one left");
        assertEquals("888", route.args(Map.of("message", "看看跟进内容 888")).get("recordId"));
    }

    @Test
    void theRouteStillNamesTheToolAndGuessesNothing() {
        CrmFollowUpRecordTools.RecordRoute route = new CrmFollowUpRecordTools.RecordRoute();

        assertTrue(route.triggers().contains("查一条跟进"));
        assertTrue(route.args(Map.of("message", "你好")).isEmpty(),
                "no identifier means no arguments, not a guessed one");
    }

    @Test
    void theReadTriggersDoNotSwallowTheWriteFacesTriggers() {
        CrmFollowUpRecordTools.RecordRoute route = new CrmFollowUpRecordTools.RecordRoute();
        List<String> writeTriggers = new CrmFollowUpTools.RecordRoute().triggers();

        for (String write : writeTriggers) {
            for (String read : route.triggers()) {
                assertFalse(read.contains(write),
                        "read trigger '" + read + "' contains the write trigger '" + write + "'; routes match by contains");
            }
        }
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("get_crm_followup_record", tool.name());
        assertEquals("R1", tool.riskLevel());
        assertEquals(1, tool.parameters().size());
        assertEquals("recordId", tool.parameters().get(0).name());
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }

    private static CrmFollowUpRecordDO record() {
        CrmFollowUpRecordDO record = new CrmFollowUpRecordDO();
        record.setId(600L);
        record.setBizType(2);
        record.setBizId(5564L);
        record.setType(1);
        record.setContent("拜访-CRM 跟进");
        record.setNextTime(LocalDateTime.of(2026, 11, 11, 9, 0));
        record.setCreateTime(LocalDateTime.of(2026, 11, 4, 8, 59));
        record.setCreator("42");
        record.setUpdater("42");
        record.setContactIds(List.of(3L));
        record.setBusinessIds(List.of(4L));
        record.setFileUrls(List.of("/files/a.pdf"));
        return record;
    }
}
