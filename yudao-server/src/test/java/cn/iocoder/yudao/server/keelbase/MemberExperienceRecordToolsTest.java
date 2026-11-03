// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.authz.OwnershipGuard;
import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.member.controller.admin.level.vo.experience.MemberExperienceRecordPageReqVO;
import cn.iocoder.yudao.module.member.dal.dataobject.level.MemberExperienceRecordDO;
import cn.iocoder.yudao.module.member.service.level.MemberExperienceRecordService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 经验面：一个会员的经验变动，绝不是一个不筛的分页，走粗闸。
 *
 * The experience face: one member's experience changes, never an unfiltered page, through the coarse gate.
 */
class MemberExperienceRecordToolsTest {

    private MemberExperienceRecordService service;
    private OwnershipGuard guard;
    private MemberExperienceRecordTools.ListTool tool;

    @BeforeEach
    void setUp() {
        service = mock(MemberExperienceRecordService.class);
        guard = mock(OwnershipGuard.class);
        tool = new MemberExperienceRecordTools.ListTool(service, guard);
    }

    @Test
    @SuppressWarnings("unchecked")
    void oneMembersRecordsAreProjected() {
        when(service.getExperienceRecordPage(any()))
                .thenReturn(new PageResult<>(List.of(record(1L)), 1L));

        ToolResult result = tool.execute(Map.of("memberId", 7), admin());

        assertTrue(result.success());
        Map<String, Object> answer = (Map<String, Object>) result.data();
        assertEquals(1, answer.get("count"));
        List<Map<String, Object>> rows = (List<Map<String, Object>>) answer.get("records");
        assertEquals(List.of("id", "bizId", "bizType", "title", "description", "experience",
                "totalExperience", "createTime"), List.copyOf(rows.get(0).keySet()));
    }

    @Test
    void thePageIsAlwaysBuiltWithTheMemberIdItWasGiven() {
        when(service.getExperienceRecordPage(any())).thenReturn(new PageResult<>(List.of(), 0L));

        tool.execute(Map.of("memberId", 7), admin());

        ArgumentCaptor<MemberExperienceRecordPageReqVO> query =
                ArgumentCaptor.forClass(MemberExperienceRecordPageReqVO.class);
        verify(service).getExperienceRecordPage(query.capture());
        assertEquals(7L, query.getValue().getUserId());
        assertEquals(MemberExperienceRecordTools.DEFAULT_LIMIT, query.getValue().getPageSize());
    }

    @Test
    void aMissingMemberIdIsRefusedBeforeTheServiceIsAsked() {
        assertFalse(tool.execute(Map.of(), admin()).success());
        verify(service, never()).getExperienceRecordPage(any());
    }

    @Test
    void aCallerTheGateRefusesNeverReachesTheService() {
        doThrow(denied()).when(guard).requireAction(any(), any(), any());

        assertThrows(RuleDeniedException.class, () -> tool.execute(Map.of("memberId", 7), admin()));
        verify(service, never()).getExperienceRecordPage(any());
    }

    @Test
    void theRouteReadsTheMemberOutOfTheMessage() {
        Map<String, Object> args = new MemberExperienceRecordTools.ExperienceRecordRoute()
                .args(Map.of("message", "会员 7 的经验记录"));

        assertEquals("7", args.get("memberId"));
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("list_member_experience_records", tool.name());
        assertEquals("R1", tool.riskLevel());
    }

    private static Principal admin() {
        return new Principal("1", Principal.ROLE_ADMIN);
    }

    private static RuleDeniedException denied() {
        return new RuleDeniedException(null, "not permitted", MemberExperienceRecordTools.SUBJECT, "read",
                "该身份对 `MemberExperienceRecord` 没有 `read` 权限");
    }

    private static MemberExperienceRecordDO record(Long id) {
        MemberExperienceRecordDO row = new MemberExperienceRecordDO();
        row.setId(id);
        row.setUserId(7L);
        row.setBizId("biz-" + id);
        row.setBizType(1);
        row.setTitle("签到奖励");
        row.setDescription("获得 5 经验");
        row.setExperience(5);
        row.setTotalExperience(45);
        row.setCreateTime(LocalDateTime.of(2026, 11, 3, 11, 0));
        return row;
    }
}
