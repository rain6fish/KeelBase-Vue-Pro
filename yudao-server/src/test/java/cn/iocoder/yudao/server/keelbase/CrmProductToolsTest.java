// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.crm.controller.admin.product.vo.product.CrmProductPageReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.product.vo.product.CrmProductSaveReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.product.CrmProductDO;
import cn.iocoder.yudao.module.crm.service.product.CrmProductService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 产品工具面：**路由读得出必填项**、**写不带属主**、**读不带描述**。
 *
 * <p>第一条要钉的是「人批准之前就被拒」那一类缺陷：引擎在**任何确认行存在之前**按工具声明的必填项校验提议 ——
 * 缺一个、或带一个没声明的参数，这次调用都走不到人面前。故路由交出的键必须落在声明的参数里。
 *
 * <p>The product tool face: the route can read every required argument, the write carries no owner, and the
 * read drops the description. The first is the "refused before a human is asked" defect class: the engine
 * validates a proposal against the tool's declared parameters before any confirmation row exists, so a
 * missing required one — or an undeclared one — never reaches a person. What the route hands over must be a
 * subset of what the tool declares.
 */
class CrmProductToolsTest {

    private static final String CALLER = "42";

    private CrmProductService service;
    private YudaoToolPermissions permissions;
    private CrmProductTools.CreateTool createTool;
    private CrmProductTools.ListTool listTool;

    @BeforeEach
    void setUp() {
        service = mock(CrmProductService.class);
        permissions = mock(YudaoToolPermissions.class);
        createTool = new CrmProductTools.CreateTool(service, permissions);
        listTool = new CrmProductTools.ListTool(service);
    }

    @Test
    void theCreateRouteReadsEveryRequiredArgumentAndNothingUndeclared() {
        Map<String, Object> args = new CrmProductTools.CreateRoute().args(Map.of(
                "message", "新建产品 名称=标准版 编码=SKU-1 价格=9.9 状态=1 分类=3 单位=2"));

        assertEquals("标准版", args.get("name"));
        assertEquals("SKU-1", args.get("no"));
        assertEquals(new BigDecimal("9.9"), args.get("price"));
        assertEquals(1, args.get("status"));
        assertEquals(3L, args.get("categoryId"));
        assertEquals(2, args.get("unit"));

        Set<String> declared = createTool.parameters().stream()
                .map(ToolParameter::name).collect(Collectors.toSet());
        assertTrue(declared.containsAll(args.keySet()),
                "an argument the tool does not declare is refused before a person is asked: " + args.keySet());
    }

    @Test
    void theListRouteEmitsOnlyDeclaredArguments() {
        Set<String> declared = listTool.parameters().stream()
                .map(ToolParameter::name).collect(Collectors.toSet());

        assertTrue(declared.containsAll(new CrmProductTools.ListRoute().args(Map.of()).keySet()));
        assertTrue(declared.containsAll(new CrmProductTools.ListRoute()
                .args(Map.of("message", "列出产品 名称=标准 状态=1")).keySet()));
    }

    @Test
    void theWriteLeavesTheOwnerToTheAspect() {
        when(permissions.refusal(CALLER, "crm:product:create")).thenReturn(null);
        when(service.createProduct(any(CrmProductSaveReqVO.class))).thenReturn(77L);

        ToolResult result = createTool.execute(Map.of(
                "name", "标准版", "no", "SKU-1", "price", 9.9, "status", 1, "categoryId", 3), caller());

        assertTrue(result.success());
        assertEquals(77L, ((Map<?, ?>) result.data()).get("id"));
        CrmProductSaveReqVO written = written();
        assertNull(written.getOwnerUserId(), "the aspect stamps the owner from the caller");
        assertEquals(0, written.getUnit(), "a unit nobody named stays zero rather than a guess");
        assertEquals(new BigDecimal("9.9"), written.getPrice());
    }

    @Test
    void aRefusedCreateNeverReachesTheService() {
        when(permissions.refusal(CALLER, "crm:product:create"))
                .thenReturn("not permitted: this caller lacks the 'crm:product:create' permission");

        ToolResult result = createTool.execute(Map.of(
                "name", "标准版", "no", "SKU-1", "price", 9.9, "status", 1, "categoryId", 3), caller());

        assertFalse(result.success());
        verify(service, never()).createProduct(any(CrmProductSaveReqVO.class));
    }

    @Test
    void theListProjectsBusinessFactsOnly() {
        CrmProductDO row = new CrmProductDO();
        row.setId(1L);
        row.setName("标准版");
        row.setNo("SKU-1");
        row.setUnit(2);
        row.setPrice(new BigDecimal("9.9"));
        row.setStatus(1);
        row.setCategoryId(3L);
        row.setOwnerUserId(42L);
        row.setDescription("自由文本");
        when(service.getProductPage(any(CrmProductPageReqVO.class)))
                .thenReturn(new PageResult<>(List.of(row), 1L));

        ToolResult result = listTool.execute(Map.of(), caller());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.data();
        assertEquals(List.of("id", "name", "no", "unit", "price", "status", "categoryId", "ownerUserId"),
                List.copyOf(rows.get(0).keySet()));
        assertFalse(result.data().toString().contains("自由文本"), "the free-text description is not projected");
    }

    private CrmProductSaveReqVO written() {
        ArgumentCaptor<CrmProductSaveReqVO> captor = ArgumentCaptor.forClass(CrmProductSaveReqVO.class);
        verify(service).createProduct(captor.capture());
        return captor.getValue();
    }

    private static Principal caller() {
        return new Principal(CALLER, Principal.ROLE_USER);
    }
}
