// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.module.pay.service.wallet;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import cn.iocoder.yudao.module.pay.dal.dataobject.wallet.PayWalletRechargeDO;
import cn.iocoder.yudao.module.pay.dal.mysql.wallet.PayWalletRechargeMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 新加的只读单行口：按编号读一行，读不到就交回 null；不在这里判属主。
 *
 * <p>The newly added read-only single-row port: one row by id, {@code null} when there is none, and no owner
 * decision at this layer — that stays with the tool path.
 */
@ExtendWith(MockitoExtension.class)
class PayWalletRechargeServiceTest {

    @Mock
    private PayWalletRechargeMapper walletRechargeMapper;

    @InjectMocks
    private PayWalletRechargeServiceImpl service;

    @Test
    void theReadReturnsTheRowItsIdentifierNames() {
        PayWalletRechargeDO recharge = new PayWalletRechargeDO();
        recharge.setId(7L);
        recharge.setWalletId(9L);
        when(walletRechargeMapper.selectById(7L)).thenReturn(recharge);

        assertSame(recharge, service.getWalletRecharge(7L));
        verify(walletRechargeMapper).selectById(7L);
    }

    @Test
    void aMissingRowIsAnsweredWithNullRatherThanAnError() {
        when(walletRechargeMapper.selectById(404L)).thenReturn(null);

        assertNull(service.getWalletRecharge(404L),
                "the port reads; whether a missing row is an error belongs to the caller");
    }
}
