// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.SQLException;
import java.time.Instant;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;

/**
 * 写不进库只是一次**少报**，不是一次失败的请求 —— 这是这一层唯一的失败姿态，故单独量它。
 *
 * <p>库坏（表不在、连不上）时：{@code write} 不抛、{@code record} 不抛、{@code stop} 的收尾不抛。三者任何
 * 一个抛出去，留痕就会影响它本该完全不碰的东西。
 *
 * <p>A row that cannot be written is a **shallower record**, not a failed request — the only failure posture
 * this layer has, so it is measured on its own.
 *
 * <p>With a broken database (no table, no connection): {@code write} does not throw, {@code record} does
 * not throw, and {@code stop}'s flush does not throw. Any of the three throwing would let the trail touch
 * what it must never touch.
 */
class YudaoBypassAuditJdbcSinkTest {

    private static final YudaoBypassAuditRow ROW = new YudaoBypassAuditRow(
            Instant.parse("2026-10-30T12:00:00Z"), "POST", "/admin-api/crm/contract/create",
            "crm", "contract", 100L, 1L, 200, 0, 12L);

    @Test
    void aBrokenDatabaseIsLoggedRatherThanThrown() throws SQLException {
        YudaoBypassAuditJdbcSink sink = new YudaoBypassAuditJdbcSink(brokenDataSource());
        try {
            assertDoesNotThrow(() -> sink.write(ROW),
                    "an insert that cannot run is a missing record, never an exception");
            assertDoesNotThrow(() -> sink.record(ROW),
                    "handing a row over must not depend on the database being there");
        } finally {
            assertDoesNotThrow(sink::stop, "shutdown flushes what it can and still does not throw");
        }
    }

    private static DataSource brokenDataSource() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        when(dataSource.getConnection()).thenThrow(new SQLException("no database here"));
        return dataSource;
    }
}
