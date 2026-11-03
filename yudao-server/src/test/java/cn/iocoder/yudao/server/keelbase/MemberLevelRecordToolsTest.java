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
import cn.iocoder.yudao.module.member.controller.admin.level.vo.record.MemberLevelRecordPageReqVO;
import cn.iocoder.yudao.module.member.dal.dataobject.level.MemberLevelRecordDO;
import cn.iocoder.yudao.module.member.service.level.MemberLevelRecordService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 等级记录面：一个会员的等级变动，绝不是一个不筛的分页，走粗闸。
 *
 * The level-record face: one member's level changes, never an unfiltered page, through the coarse gate.
 */
class MemberLevelRecordToolsTest {

    private MemberLevelRecordService service;
    private OwnershipGuard guard;
    private MemberLevelRecordTools.ListTool tool;

    @BeforeEach
    void setUp() {
        service = mock(MemberLevelRecordService.class);
        guard = mock(OwnershipGuard.class);
        tool = new MemberLevelRecordTools.ListTool(service, guard);
    }

    @Test
    @SuppressWarnings("unchecked")
    void oneMembersRecordsAreProjected() {
        when(service.getLevelRecordPage(any()))
                .thenReturn(new PageResult<>(List.of(record(1L)), 1L));

        ToolResult result = tool.execute(Map.of("memberId", 7), admin());

        assertTrue(result.success());
        Map<String, Object> answer = (Map<String, Object>) result.data();
        assertEquals(1, answer.get("count"));
        List<Map<String, Object>> rows = (List<Map<String, Object>>) answer.get("records");
        assertEquals(List.of("id", "levelId", "level", "discountPercent", "experience", "userExperience",
                "description", "remark", "createTime"), List.copyOf(rows.get(0).keySet()));
    }

    @Test
    void thePageIsAlwaysBuiltWithTheMemberIdItWasGiven() {
        when(service.getLevelRecordPage(any())).thenReturn(new PageResult<>(List.of(), 0L));

        tool.execute(Map.of("memberId", 7), admin());

        ArgumentCaptor<MemberLevelRecordPageReqVO> query =
                ArgumentCaptor.forClass(MemberLevelRecordPageReqVO.class);
        verify(service).getLevelRecordPage(query.capture());
        assertEquals(7L, query.getValue().getUserId());
        assertEquals(MemberLevelRecordTools.DEFAULT_LIMIT, query.getValue().getPageSize());
    }

    @Test
    void aMissingMemberIdIsRefusedBeforeTheServiceIsAsked() {
        assertFalse(tool.execute(Map.of(), admin()).success());
        verify(service, never()).getLevelRecordPage(any());
    }

    @Test
    void aCallerTheGateRefusesNeverReachesTheService() {
        doThrow(denied()).when(guard).requireAction(any(), any(), any());

        assertThrows(RuleDeniedException.class, () -> tool.execute(Map.of("memberId", 7), admin()));
        verify(service, never()).getLevelRecordPage(any());
    }

    @Test
    void theRouteReadsTheMemberOutOfTheMessage() {
        Map<String, Object> args = new MemberLevelRecordTools.LevelRecordRoute()
                .args(Map.of("message", "会员 7 的等级记录"));

        assertEquals("7", args.get("memberId"));
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("list_member_level_records", tool.name());
        assertEquals("R1", tool.riskLevel());
    }

    private static Principal admin() {
        return new Principal("1", Principal.ROLE_ADMIN);
    }

    private static RuleDeniedException denied() {
        return new RuleDeniedException(null, "not permitted", MemberLevelRecordTools.SUBJECT, "read",
                "该身份对 `MemberLevelRecord` 没有 `read` 权限");
    }

    private static MemberLevelRecordDO record(Long id) {
        MemberLevelRecordDO row = new MemberLevelRecordDO();
        row.setId(id);
        row.setUserId(7L);
        row.setLevelId(5L);
        row.setLevel(5);
        row.setDiscountPercent(100);
        row.setExperience(80);
        row.setUserExperience(80);
        row.setDescription("管理员调整为：黄金");
        row.setRemark("升级");
        row.setCreateTime(LocalDateTime.of(2026, 11, 3, 9, 30));
        return row;
    }
}
