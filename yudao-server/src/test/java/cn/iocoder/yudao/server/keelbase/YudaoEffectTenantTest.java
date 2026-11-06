// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import cn.com.keelbase.runtime.effect.SideEffect;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

/**
 * 撤销的补偿必须跑在 **effect 属主那次写所在的租户** 下，而不是撤销者当前的租户。
 *
 * <p>运行时的 {@code side_effects} 没有租户列，宿主模块的删除又是租户过滤的；拿撤销者的租户去删属主的行，
 * 跨租户时匹配不到行、正常返回，账本却说 {@code revoked}。本测试钉住修复后的两条：属主租户从
 * {@code system_users} 读出来；读不出来就拒绝，绝不回落到撤销者或种子租户。
 *
 * <p>The compensation must run under the tenant of the effect owner's write, not the revoker's
 * current tenant. The runtime's {@code side_effects} has no tenant column and the host's module
 * deletes are tenant-filtered: using the revoker's tenant misses the owner's row, returns normally,
 * and the ledger says {@code revoked}. This test pins the repair's two halves: the owner's tenant is
 * read from {@code system_users}, and an unreadable one is refused rather than guessed.
 */
class YudaoEffectTenantTest {

    @AfterEach
    void clearTenant() {
        TenantContextHolder.clear();
    }

    @Test
    void theOwnersTenantWinsOverTheRevokersContext() {
        JdbcDataSource dataSource = database();
        insertOwner(dataSource, 42L, 1L);
        TenantContextHolder.setTenantId(2L); // the revoker

        assertEquals(1L, new YudaoEffectTenant(dataSource).of(effect("42")),
                "the tenant must come from the effect's owner, not from the revoke request");
    }

    @Test
    void anOwnerWithNoTenantRowIsRefusedRatherThanGuessed() {
        JdbcDataSource dataSource = database();
        TenantContextHolder.setTenantId(2L);

        ResponseStatusException refused = assertThrows(ResponseStatusException.class,
                () -> new YudaoEffectTenant(dataSource).of(effect("42")));

        assertEquals(HttpStatus.CONFLICT, refused.getStatusCode());
    }

    @Test
    void compensationRunsUnderTheEffectsTenantNotTheRevokers() {
        JdbcDataSource dataSource = database();
        insertOwner(dataSource, 42L, 1L);
        new YudaoLocalCompensators(new YudaoEffectTenant(dataSource)); // installs the resolver
        TenantContextHolder.setTenantId(2L); // the revoker

        AtomicLong seen = new AtomicLong();
        YudaoLocalCompensators.as(effect("42"), () -> seen.set(YudaoCallerTenant.current()));

        assertEquals(1L, seen.get(),
                "the compensation must run in the write's tenant, not the revoker's");
    }

    private static JdbcDataSource database() {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:yd46-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1");
        new JdbcTemplate(dataSource).execute(
                "create table system_users (id bigint primary key, tenant_id bigint)");
        return dataSource;
    }

    private static void insertOwner(JdbcDataSource dataSource, long userId, long tenantId) {
        new JdbcTemplate(dataSource).update(
                "insert into system_users (id, tenant_id) values (?, ?)", userId, tenantId);
    }

    private static SideEffect effect(String userId) {
        return new SideEffect("yd46-" + UUID.randomUUID(), userId, "create_x", "x", "1",
                "local_compensate", "hash", null);
    }
}
