// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.crm.controller.admin.contact.vo.CrmContactPageReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.contact.CrmContactDO;
import cn.iocoder.yudao.module.crm.enums.common.CrmSceneTypeEnum;
import cn.iocoder.yudao.module.crm.service.contact.CrmContactService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 联系人工具面的两个出口：**列**（四列投影，联系方式一律不出）与**建**（两个必填项由路由从用户写下的文字里读）。
 *
 * <p>为什么投影在这里断而不在真栈门禁里断：两个运行时都**不把工具结果放上线**（冻结的 `chat-response` 只有
 * `reply`/`toolCalls`，流式的 `tool_end` 只有成功与否）。故「返回结构里有没有联系方式」只能直读
 * `ToolResult.data()` —— 那是同一个方法的返回值，不是页面、不是答复，也不是事后从库里推的。
 *
 * <p>第二条测试钉住的是**门禁跑前必查**的那一半：引擎在**人批准之前**就按工具声明的必填项拒掉提议，故路由必须
 * 能从用户明确写出的文字里读出 `customerId` 与 `name`；`targetId` 只在文字没写客户时兜底。
 *
 * <p>Two exits of the contact tool face: <b>list</b> (a four-column projection; no contact channel leaves)
 * and <b>create</b> (its two required values read from what the caller typed).
 *
 * <p>Why the projection is asserted here rather than in the real-stack gate: neither runtime puts a tool
 * result on the wire (the frozen `chat-response` carries only `reply`/`toolCalls`, and the streaming
 * `tool_end` carries only success). So "does the returned structure contain a contact channel" can only be
 * read from `ToolResult.data()` — the return value of the same method, not a page, not a reply, and not
 * something inferred afterwards from the database.
 *
 * <p>The second test pins the other half of the gate's pre-run audit: the engine refuses a proposal that
 * lacks declared required arguments <b>before</b> a person is asked, so the route must read `customerId`
 * and `name` from what the caller explicitly wrote; `targetId` is only a fallback when the text names no
 * customer.
 */
class CrmContactToolsTest {

    private static final String CALLER = "42";

    private CrmContactService service;
    private CrmContactTools.ListTool listTool;

    @BeforeEach
    void setUp() {
        service = mock(CrmContactService.class);
        listTool = new CrmContactTools.ListTool(service);
    }

    @Test
    void theListCarriesOnlyTheBusinessFactsAndNoContactChannel() {
        CrmContactDO row = new CrmContactDO();
        row.setId(9L);
        row.setName("张三");
        row.setCustomerId(5L);
        row.setOwnerUserId(42L);
        // 每一列联系方式都填上：投影少一列都逃不过下面那条「整段返回里不许出现」的断言。
        // Every channel column is populated: a projection that forgets one cannot pass the "must not
        // appear anywhere in the returned structure" assertion below.
        row.setMobile("13800000000");
        row.setTelephone("021-0029922");
        row.setQq(197272662L);
        row.setWechat("gate-wechat-9");
        row.setEmail("gate-contact@example.com");
        row.setDetailAddress("gate address 9");
        row.setContactLastContent("gate private note 9");
        when(service.getContactPage(any(CrmContactPageReqVO.class), eq(42L)))
                .thenReturn(new PageResult<>(List.of(row), 1L));

        ToolResult result = listTool.execute(Map.of(), caller());

        assertTrue(result.success());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.data();
        assertEquals(List.of("id", "name", "customerId", "ownerUserId"),
                List.copyOf(rows.get(0).keySet()), "the projection is exactly the business facts");
        String rendered = String.valueOf(result.data());
        for (String channel : List.of("13800000000", "021-0029922", "197272662", "gate-wechat-9",
                "gate-contact@example.com", "gate address 9", "gate private note 9")) {
            assertFalse(rendered.contains(channel), "no contact channel may leave: " + channel);
        }

        // 身份与场景以模块自己查询所取的入参传递 —— 分页由模块收束，不在这里事后过滤。
        // Identity and scene travel as the module query's own arguments — the module scopes the page, and
        // this class does not post-filter it.
        ArgumentCaptor<CrmContactPageReqVO> query = ArgumentCaptor.forClass(CrmContactPageReqVO.class);
        verify(service).getContactPage(query.capture(), eq(42L));
        assertEquals(CrmSceneTypeEnum.OWNER.getType(), query.getValue().getSceneType());
    }

    @Test
    void theCreateRouteReadsBothRequiredValuesFromTypedText() {
        CrmContactTools.CreateRoute route = new CrmContactTools.CreateRoute();

        Map<String, Object> explicit = route.args(
                Map.of("message", "加联系人 客户=12 姓名=张三", "targetId", 77L));
        assertEquals(12L, explicit.get("customerId"), "what the caller typed wins over the slot");
        assertEquals("张三", explicit.get("name"));

        Map<String, Object> fallback = route.args(
                Map.of("message", "加联系人 姓名=张三", "targetId", 77L));
        assertEquals(77L, fallback.get("customerId"), "the slot is only a fallback");
        assertEquals("张三", fallback.get("name"));
    }

    @Test
    void theFaceDeclaresItsContract() {
        assertEquals("list_crm_contacts", listTool.name());
        assertEquals("R1", listTool.riskLevel());
        assertEquals(List.of("scope"), listTool.parameters().stream().map(p -> p.name()).toList());
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }
}
