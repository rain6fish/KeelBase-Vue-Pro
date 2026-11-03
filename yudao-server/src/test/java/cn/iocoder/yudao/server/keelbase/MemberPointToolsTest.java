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
import cn.iocoder.yudao.module.member.controller.admin.point.vo.recrod.MemberPointRecordPageReqVO;
import cn.iocoder.yudao.module.member.dal.dataobject.point.MemberPointRecordDO;
import cn.iocoder.yudao.module.member.service.point.MemberPointRecordService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 积分记录面：一个会员的记录，绝不是一个不筛的分页，走粗闸。
 *
 * <p>这里钉三件事：分页总是用它拿到的会员编号构造——这张表没有租户列，不带它就会跨租户；答复只带业务字段、不带
 * 身份字段；被闸拒掉的调用方根本到不了 service。
 *
 * The point-record face: one member's records, never an unfiltered page, through the coarse gate.
 *
 * <p>Three things are pinned here. The page is always built with the member id it was given — the table
 * has no tenant column, so a page without one would cross tenants. The answer carries the business
 * fields and no identity field. And a caller the gate refuses never reaches the service.
 */
class MemberPointToolsTest {

    private MemberPointRecordService service;
    private OwnershipGuard guard;
    private MemberPointTools.ListTool tool;

    @BeforeEach
    void setUp() {
        service = mock(MemberPointRecordService.class);
        guard = mock(OwnershipGuard.class);
        tool = new MemberPointTools.ListTool(service, guard);
    }

    @Test
    @SuppressWarnings("unchecked")
    void oneMembersRecordsAreProjected() {
        when(service.getPointRecordPage(any()))
                .thenReturn(new PageResult<>(List.of(record(1L, 10), record(2L, -5)), 2L));

        ToolResult result = tool.execute(Map.of("memberId", 7), admin());

        assertTrue(result.success());
        Map<String, Object> answer = (Map<String, Object>) result.data();
        assertEquals(2, answer.get("count"));
        List<Map<String, Object>> rows = (List<Map<String, Object>>) answer.get("records");
        assertEquals(List.of("id", "bizId", "bizType", "title", "description", "point", "totalPoint",
                "createTime"), List.copyOf(rows.get(0).keySet()));
    }

    @Test
    void thePageIsAlwaysBuiltWithTheMemberIdItWasGiven() {
        when(service.getPointRecordPage(any())).thenReturn(new PageResult<>(List.of(), 0L));

        tool.execute(Map.of("memberId", 7), admin());

        ArgumentCaptor<MemberPointRecordPageReqVO> query =
                ArgumentCaptor.forClass(MemberPointRecordPageReqVO.class);
        verify(service).getPointRecordPage(query.capture());
        assertEquals(7L, query.getValue().getUserId(), "no tenant column: the member id is the only filter");
        assertEquals(1, query.getValue().getPageNo());
        assertEquals(MemberPointTools.DEFAULT_LIMIT, query.getValue().getPageSize());
    }

    @Test
    void theLimitIsClampedInBothDirections() {
        when(service.getPointRecordPage(any())).thenReturn(new PageResult<>(List.of(), 0L));

        tool.execute(Map.of("memberId", 7, "limit", 999), admin());
        tool.execute(Map.of("memberId", 7, "limit", 0), admin());
        tool.execute(Map.of("memberId", 7, "limit", 5), admin());

        ArgumentCaptor<MemberPointRecordPageReqVO> query =
                ArgumentCaptor.forClass(MemberPointRecordPageReqVO.class);
        verify(service, org.mockito.Mockito.times(3)).getPointRecordPage(query.capture());
        List<MemberPointRecordPageReqVO> all = query.getAllValues();
        assertEquals(MemberPointTools.MAX_LIMIT, all.get(0).getPageSize());
        assertEquals(1, all.get(1).getPageSize());
        assertEquals(5, all.get(2).getPageSize());
    }

    @Test
    void aMissingMemberIdIsRefusedBeforeTheServiceIsAsked() {
        ToolResult result = tool.execute(Map.of(), admin());

        assertFalse(result.success());
        verify(service, never()).getPointRecordPage(any());
    }

    @Test
    void aCallerTheGateRefusesNeverReachesTheService() {
        doThrow(denied()).when(guard).requireAction(any(), any(), any());

        assertThrows(RuleDeniedException.class, () -> tool.execute(Map.of("memberId", 7), admin()));
        verify(service, never()).getPointRecordPage(any());
    }

    @Test
    void theRouteReadsTheMemberOutOfTheMessage() {
        Map<String, Object> args = new MemberPointTools.PointRecordRoute()
                .args(Map.of("message", "会员 7 的积分记录"));

        assertEquals("7", args.get("memberId"));
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("list_member_point_records", tool.name());
        assertEquals("R1", tool.riskLevel());
    }

    private static Principal admin() {
        return new Principal("1", Principal.ROLE_ADMIN);
    }

    private static RuleDeniedException denied() {
        return new RuleDeniedException(null, "not permitted", MemberPointTools.SUBJECT, "read",
                "该身份对 `MemberPointRecord` 没有 `read` 权限");
    }

    private static MemberPointRecordDO record(Long id, int point) {
        MemberPointRecordDO row = new MemberPointRecordDO();
        row.setId(id);
        row.setUserId(7L);
        row.setBizId("biz-" + id);
        row.setBizType(1);
        row.setTitle("签到奖励");
        row.setDescription("获得 " + point + " 积分");
        row.setPoint(point);
        row.setTotalPoint(100 + point);
        row.setCreateTime(LocalDateTime.of(2026, 11, 3, 10, 0));
        return row;
    }
}
