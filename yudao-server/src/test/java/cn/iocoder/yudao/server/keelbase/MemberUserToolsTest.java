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
import cn.iocoder.yudao.module.member.dal.dataobject.user.MemberUserDO;
import cn.iocoder.yudao.module.member.service.user.MemberUserService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 会员面的第一批：搜索与读取，都走粗闸，都用同一份投影。
 *
 * <p>最要紧的是投影：一行会员带着手机、邮箱、口令散列与两个 IP，一个都不许出去。其次是空搜索绝不能变成一次导出，
 * 第三是被闸拒掉的调用方根本到不了 service。
 *
 * The member face's first batch: search and read, both through the coarse gate, both with the same
 * projection.
 *
 * <p>The projection is the test that matters most: a member row carries a phone, an e-mail, a password
 * hash and two IPs, and none of them may leave. The second is that an empty search never becomes an
 * export, and the third is that a caller the gate refuses never reaches the service at all.
 */
class MemberUserToolsTest {

    private static final String CALLER = "1";
    private static final Principal ADMIN = new Principal(CALLER, Principal.ROLE_ADMIN);

    private MemberUserService service;
    private OwnershipGuard guard;
    private MemberUserTools.FindTool findTool;
    private MemberUserTools.GetTool getTool;

    @BeforeEach
    void setUp() {
        service = mock(MemberUserService.class);
        guard = mock(OwnershipGuard.class);
        findTool = new MemberUserTools.FindTool(service, guard);
        getTool = new MemberUserTools.GetTool(service, guard);
    }

    @Test
    @SuppressWarnings("unchecked")
    void aSearchProjectsTheBusinessFieldsAndNothingElse() {
        when(service.getUserListByNickname("小明")).thenReturn(List.of(member(7L, "小明")));

        ToolResult result = findTool.execute(Map.of("nickname", "小明"), ADMIN);

        assertTrue(result.success());
        Map<String, Object> answer = (Map<String, Object>) result.data();
        assertEquals(1, answer.get("count"));
        List<Map<String, Object>> rows = (List<Map<String, Object>>) answer.get("members");
        assertEquals(1, rows.size());
        assertEquals(List.of("id", "nickname", "status", "levelId", "groupId", "point", "experience",
                "createTime"), List.copyOf(rows.get(0).keySet()),
                "contact and credential fields never leave");
    }

    @Test
    @SuppressWarnings("unchecked")
    void aSearchIsTruncatedRatherThanRunToListCompletion() {
        List<MemberUserDO> many = new ArrayList<>();
        for (long id = 1; id <= 25; id++) {
            many.add(member(id, "同名" + id));
        }
        when(service.getUserListByNickname("同名")).thenReturn(many);

        ToolResult result = findTool.execute(Map.of("nickname", "同名"), ADMIN);

        Map<String, Object> answer = (Map<String, Object>) result.data();
        assertEquals(MemberUserTools.SEARCH_LIMIT, answer.get("count"));
        assertEquals(MemberUserTools.SEARCH_LIMIT, ((List<?>) answer.get("members")).size());
    }

    @Test
    void aBlankSearchNeverBecomesAnExport() {
        ToolResult result = findTool.execute(Map.of("nickname", "  "), ADMIN);

        assertFalse(result.success());
        verify(service, never()).getUserListByNickname(any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void aMemberIsReadByItsId() {
        when(service.getUser(7L)).thenReturn(member(7L, "小明"));

        ToolResult result = getTool.execute(Map.of("memberId", 7), ADMIN);

        assertTrue(result.success());
        Map<String, Object> out = (Map<String, Object>) result.data();
        assertEquals(7L, out.get("id"));
        assertEquals(120, out.get("point"));
        assertFalse(out.containsKey("mobile"));
        assertFalse(out.containsKey("email"));
    }

    @Test
    void aMemberThatIsNotThereReadsAsAFailure() {
        when(service.getUser(9L)).thenReturn(null);

        ToolResult result = getTool.execute(Map.of("memberId", 9), ADMIN);

        assertFalse(result.success());
    }

    @Test
    void aNonNumericIdIsRefusedBeforeTheServiceIsAsked() {
        ToolResult result = getTool.execute(Map.of("memberId", "会员九"), ADMIN);

        assertFalse(result.success());
        verify(service, never()).getUser(any());
    }

    @Test
    void aCallerTheGateRefusesNeverReachesTheService() {
        doThrow(denied()).when(guard).requireAction(any(), any(), any());

        assertThrows(RuleDeniedException.class, () -> findTool.execute(Map.of("nickname", "小明"), ADMIN));
        assertThrows(RuleDeniedException.class, () -> getTool.execute(Map.of("memberId", 7), ADMIN));
        verify(service, never()).getUserListByNickname(any());
        verify(service, never()).getUser(any());
    }

    @Test
    void theByIdRouteReadsTheNumberOutOfTheMessage() {
        Map<String, Object> args = new MemberUserTools.GetRoute().args(Map.of("message", "会员资料 7"));

        assertEquals("7", args.get("memberId"));
    }

    @Test
    void theByIdRouteTakesTheStructuredSlotWhenTheRuntimeFillsIt() {
        Map<String, Object> args = new MemberUserTools.GetRoute().args(Map.of("targetId", 9L));

        assertEquals(9L, args.get("memberId"));
    }

    @Test
    void theSearchRouteReadsTheNameOutOfTheMessage() {
        Map<String, Object> args = new MemberUserTools.FindRoute().args(Map.of("message", "找会员 小明"));

        assertEquals("小明", args.get("nickname"));
    }

    @Test
    void theFacesDeclareTheirContract() {
        assertEquals("find_members", findTool.name());
        assertEquals("R1", findTool.riskLevel());
        assertEquals("get_member", getTool.name());
        assertEquals("R1", getTool.riskLevel());
    }

    private static RuleDeniedException denied() {
        return new RuleDeniedException(null, "not permitted", MemberUserTools.SUBJECT, "read",
                "该身份对 `MemberUser` 没有 `read` 权限");
    }

    private static MemberUserDO member(long id, String nickname) {
        MemberUserDO row = new MemberUserDO();
        row.setId(id);
        row.setNickname(nickname);
        row.setStatus(0);
        row.setLevelId(2L);
        row.setGroupId(3L);
        row.setPoint(120);
        row.setExperience(40);
        row.setMobile("13800000000");
        row.setEmail("member@example.com");
        row.setRegisterIp("10.0.0.1");
        row.setLoginIp("10.0.0.2");
        row.setCreateTime(LocalDateTime.of(2026, 11, 3, 9, 0));
        return row;
    }
}
