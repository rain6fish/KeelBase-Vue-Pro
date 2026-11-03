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
import cn.iocoder.yudao.module.member.controller.admin.signin.vo.record.MemberSignInRecordPageReqVO;
import cn.iocoder.yudao.module.member.dal.dataobject.signin.MemberSignInRecordDO;
import cn.iocoder.yudao.module.member.service.signin.MemberSignInRecordService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 签到面：一个会员的记录，绝不是一个不筛的分页，走粗闸。
 *
 * The sign-in face: one member's records, never an unfiltered page, through the coarse gate.
 */
class MemberSignInToolsTest {

    private MemberSignInRecordService service;
    private OwnershipGuard guard;
    private MemberSignInTools.ListTool tool;

    @BeforeEach
    void setUp() {
        service = mock(MemberSignInRecordService.class);
        guard = mock(OwnershipGuard.class);
        tool = new MemberSignInTools.ListTool(service, guard);
    }

    @Test
    @SuppressWarnings("unchecked")
    void oneMembersRecordsAreProjected() {
        when(service.getSignInRecordPage(any()))
                .thenReturn(new PageResult<>(List.of(record(1L, 3)), 1L));

        ToolResult result = tool.execute(Map.of("memberId", 7), admin());

        assertTrue(result.success());
        Map<String, Object> answer = (Map<String, Object>) result.data();
        assertEquals(1, answer.get("count"));
        List<Map<String, Object>> rows = (List<Map<String, Object>>) answer.get("records");
        assertEquals(List.of("id", "day", "point", "experience", "createTime"),
                List.copyOf(rows.get(0).keySet()));
    }

    @Test
    void thePageIsAlwaysBuiltWithTheMemberIdItWasGiven() {
        when(service.getSignInRecordPage(any())).thenReturn(new PageResult<>(List.of(), 0L));

        tool.execute(Map.of("memberId", 7), admin());

        ArgumentCaptor<MemberSignInRecordPageReqVO> query =
                ArgumentCaptor.forClass(MemberSignInRecordPageReqVO.class);
        verify(service).getSignInRecordPage(query.capture());
        assertEquals(7L, query.getValue().getUserId());
        assertEquals(MemberSignInTools.DEFAULT_LIMIT, query.getValue().getPageSize());
    }

    @Test
    void aMissingMemberIdIsRefusedBeforeTheServiceIsAsked() {
        assertFalse(tool.execute(Map.of(), admin()).success());
        verify(service, never()).getSignInRecordPage(any());
    }

    @Test
    void aCallerTheGateRefusesNeverReachesTheService() {
        doThrow(denied()).when(guard).requireAction(any(), any(), any());

        assertThrows(RuleDeniedException.class, () -> tool.execute(Map.of("memberId", 7), admin()));
        verify(service, never()).getSignInRecordPage(any());
    }

    @Test
    void theRouteReadsTheMemberOutOfTheMessage() {
        Map<String, Object> args = new MemberSignInTools.SignInRecordRoute()
                .args(Map.of("message", "会员 7 的签到记录"));

        assertEquals("7", args.get("memberId"));
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("list_member_sign_in_records", tool.name());
        assertEquals("R1", tool.riskLevel());
    }

    private static Principal admin() {
        return new Principal("1", Principal.ROLE_ADMIN);
    }

    private static RuleDeniedException denied() {
        return new RuleDeniedException(null, "not permitted", MemberSignInTools.SUBJECT, "read",
                "该身份对 `MemberSignInRecord` 没有 `read` 权限");
    }

    private static MemberSignInRecordDO record(Long id, int day) {
        MemberSignInRecordDO row = new MemberSignInRecordDO();
        row.setId(id);
        row.setUserId(7L);
        row.setDay(day);
        row.setPoint(10);
        row.setExperience(5);
        row.setCreateTime(LocalDateTime.of(2026, 11, 3, 9, 0));
        return row;
    }
}
