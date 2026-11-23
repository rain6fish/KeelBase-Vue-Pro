// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import cn.iocoder.yudao.module.crm.dal.dataobject.contact.CrmContactDO;
import cn.iocoder.yudao.module.crm.dal.dataobject.customer.CrmCustomerDO;
import cn.iocoder.yudao.module.crm.dal.mysql.business.CrmBusinessMapper;
import cn.iocoder.yudao.module.crm.dal.mysql.clue.CrmClueMapper;
import cn.iocoder.yudao.module.crm.dal.mysql.contact.CrmContactMapper;
import cn.iocoder.yudao.module.crm.dal.mysql.contract.CrmContractMapper;
import cn.iocoder.yudao.module.crm.dal.mysql.customer.CrmCustomerMapper;
import cn.iocoder.yudao.module.crm.dal.mysql.followup.CrmFollowUpRecordMapper;
import cn.iocoder.yudao.module.crm.dal.mysql.product.CrmProductMapper;
import cn.iocoder.yudao.module.crm.dal.mysql.receivable.CrmReceivableMapper;
import cn.iocoder.yudao.module.crm.dal.mysql.receivable.CrmReceivablePlanMapper;
import cn.iocoder.yudao.module.fms.dal.mysql.voucher.FmsVoucherMapper;
import cn.iocoder.yudao.module.infra.dal.mysql.demo.demo01.Demo01ContactMapper;
import cn.iocoder.yudao.module.products.dal.mysql.products.ProductsMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The ledger's `targetExists` answer, in both directions: a row that is still there stays present,
 * and a row that really was deleted still reads as gone. The Proxy-1 miss was the first case.
 *
 * <p>These tests drive the correction with fake mappers, so they do not need a database or a running
 * host. The end-to-end reading against a real stack is a separate gate.
 *
 * 台账 `targetExists` 的两个方向：还在的行仍是「在」，真被删掉的行仍读作「已不在」。Proxy-1 那次
 * 误报是第一种情形。
 *
 * <p>这些测试用假 mapper 驱动更正，故不需要数据库，也不需要跑起来的宿主。真实栈上的端到端读数
 * 是另一道门禁。
 */
class YudaoEffectTargetExistenceTest {

    private CrmCustomerMapper customers;
    private CrmContactMapper crmContacts;
    private YudaoEffectTargetExistence advice;

    @BeforeEach
    void setUp() {
        customers = mock(CrmCustomerMapper.class);
        crmContacts = mock(CrmContactMapper.class);
        advice = new YudaoEffectTargetExistence(
                customers,
                mock(CrmFollowUpRecordMapper.class),
                mock(FmsVoucherMapper.class),
                mock(Demo01ContactMapper.class),
                mock(ProductsMapper.class),
                mock(CrmClueMapper.class),
                crmContacts,
                mock(CrmBusinessMapper.class),
                mock(CrmContractMapper.class),
                mock(CrmProductMapper.class),
                mock(CrmReceivableMapper.class),
                mock(CrmReceivablePlanMapper.class));
    }

    @Test
    void aCustomerThatIsStillThereReadsAsPresent() {
        when(customers.selectById(1L)).thenReturn(new CrmCustomerDO());

        Map<String, Object> row = row("crm_customer", 1L, false);

        advice.correct(page(row));

        assertEquals(true, row.get("targetExists"), "customer #1 is still in the table");
    }

    @Test
    void aCustomerThatWasDeletedStillReadsAsGone() {
        when(customers.selectById(1L)).thenReturn(null);

        Map<String, Object> row = row("crm_customer", 1L, true);

        advice.correct(page(row));

        assertEquals(false, row.get("targetExists"), "a real delete keeps the gone reading");
        assertEquals(false, row.get("targetSoftDeleted"), "a deleted row is not a soft-deleted one");
    }

    @Test
    void aSoftDeletedCustomerAlsoReadsAsGone() {
        // YuDao's mappers filter soft-deleted rows by default, so the probe sees no row.
        // 芋道的 mapper 默认滤掉软删行，故探针看不见行。
        when(customers.selectById(2L)).thenReturn(null);

        Map<String, Object> row = row("crm_customer", 2L, true);

        advice.correct(page(row));

        assertEquals(false, row.get("targetExists"));
    }

    @Test
    void aContactThatIsStillThereReadsAsPresent() {
        // Before the 2026-11-22 widening `crm_contact` had no probe, so a contact that existed read as gone.
        // 2026-11-22 扩面之前，`crm_contact` 没有探针，存在的联系人被画成「已不在」。
        when(crmContacts.selectById(3L)).thenReturn(new CrmContactDO());

        Map<String, Object> row = row("crm_contact", 3L, false);

        advice.correct(page(row));

        assertEquals(true, row.get("targetExists"), "contact #3 is still in the table");
    }

    @Test
    void aDeletedContactReadsAsGone() {
        when(crmContacts.selectById(4L)).thenReturn(null);

        Map<String, Object> row = row("crm_contact", 4L, true);

        advice.correct(page(row));

        assertEquals(false, row.get("targetExists"), "a real delete keeps the gone reading");
    }

    @Test
    void aTypeWithoutAProbeKeepsTheRuntimeAnswer() {
        Map<String, Object> row = row("some_future_type", 7L, false);

        advice.correct(page(row));

        assertEquals(false, row.get("targetExists"), "unknown types are not given an invented verdict");
    }

    @Test
    void aNonNumericIdKeepsTheRuntimeAnswer() {
        Map<String, Object> row = row("crm_customer", "not-a-number", false);

        advice.correct(page(row));

        assertEquals(false, row.get("targetExists"));
    }

    @Test
    void anUnreadableProbeKeepsTheRuntimeAnswer() {
        when(customers.selectById(9L)).thenThrow(new IllegalStateException("database unavailable"));

        Map<String, Object> row = row("crm_customer", 9L, true);
        advice.correct(page(row));

        assertTrue((Boolean) row.get("targetExists"),
                "a failed read is not evidence that the row is gone");
    }

    @Test
    void aBodyThatIsNotTheLedgerIsLeftAlone() {
        Map<String, Object> notALedger = new LinkedHashMap<>();
        notALedger.put("something", "else");

        advice.correct(notALedger);

        assertFalse(notALedger.containsKey("items"));
    }

    private static Map<String, Object> row(String type, Object id, boolean coreAnswer) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", 1);
        row.put("resultType", type);
        row.put("resultId", id);
        row.put("targetExists", coreAnswer);
        row.put("targetSoftDeleted", false);
        return row;
    }

    private static Map<String, Object> page(Map<String, Object> row) {
        Map<String, Object> page = new LinkedHashMap<>();
        page.put("total", 1);
        page.put("items", List.of(row));
        return page;
    }
}
