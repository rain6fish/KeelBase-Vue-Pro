// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.effect.SideEffect;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import java.util.List;
import javax.sql.DataSource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * 一次写所在的租户 —— 由**副作用属主自己的行**回答，不由撤销那一刻的上下文回答。
 *
 * <p>运行时的 {@code side_effects} 没有租户列（core 里没有租户概念），而宿主模块的删除是租户过滤的。
 * 撤销若跑在撤销者当前的租户下，跨租户时匹配不到行、又正常返回，于是账本说 {@code revoked} 而业务行还在。
 * 属主租户是这次写所在租户**最接近的可读事实**（一次按主键的读，{@code system_users.id → tenant_id}）；
 * 属主此后被移到别的租户会让它变旧，而本运行时没有历史租户可读。
 *
 * <p>读不到就**拒绝**：属主 id 不是数字、属主行不存在、读失败，都不回落到撤销者的租户，也不回落到种子租户 1。
 * 那两种回落都会把一个「不知道」变成一次错误的删除。
 *
 * <p>The tenant a write ran in, answered by the <b>effect owner's own row</b> rather than by the context
 * at revoke time. The runtime's {@code side_effects} has no tenant column (core has no tenant concept)
 * and the host's module deletes are tenant-filtered: a revoke under the revoker's tenant misses the
 * owner's row, returns normally, and the ledger says {@code revoked} while the business row survives.
 * The owner's tenant is the nearest readable fact of which tenant the write ran in — one primary-key
 * read, {@code system_users.id → tenant_id}; a user moved between tenants afterwards makes it stale,
 * and this runtime has no historical tenant to read.
 *
 * <p>If it cannot be read, <b>refuse</b>: no fallback to the revoker's tenant and none to the seed
 * tenant 1. Either fallback turns an "unknown" into a wrong delete.
 */
@Component
public class YudaoEffectTenant {

    private final JdbcTemplate jdbc;

    public YudaoEffectTenant(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /**
     * 这个 effect 的写所在的租户。读不到就抛 —— 调用方不该拿到一个猜出来的值。
     *
     * <p>The tenant the effect's write ran in. Throws when it cannot be read: a caller must not
     * receive a guessed value.
     */
    public long of(SideEffect effect) {
        Long userId = asId(effect.getUserId());
        if (userId == null) {
            throw refuse(effect, "its owner is not a numeric user id");
        }
        List<Long> tenants;
        try {
            // A raw primary-key read, deliberately without a tenant predicate: finding the owner's
            // tenant is the point. `executeIgnore` documents that intent and keeps the read working
            // if a future data-source-level filter is added.
            //
            // 一次按主键的原始读，**刻意**不带租户谓词：找到属主租户正是目的。`executeIgnore` 把这份意图
            // 写出来，也让这次读在未来加了数据源级过滤之后仍然可用。
            tenants = TenantUtils.executeIgnore(() -> jdbc.queryForList(
                    "select tenant_id from system_users where id = ?", Long.class, userId));
        } catch (RuntimeException notReadable) {
            throw refuse(effect, "its owner row could not be read (" + notReadable.getMessage() + ")");
        }
        if (tenants == null || tenants.isEmpty() || tenants.get(0) == null) {
            throw refuse(effect, "its owner " + userId + " has no tenant row");
        }
        return tenants.get(0);
    }

    private static ResponseStatusException refuse(SideEffect effect, String why) {
        return new ResponseStatusException(HttpStatus.CONFLICT,
                "cannot establish the tenant of effect " + effect.getId() + ": " + why
                        + "; refusing to compensate under the revoker's tenant");
    }

    private static Long asId(String value) {
        try {
            return value == null ? null : Long.valueOf(value);
        } catch (NumberFormatException notAnId) {
            return null;
        }
    }
}
