// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.sql.SQLException;
import java.time.Instant;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;

/**
 * <p>A row that cannot be written is a **shallower record**, not a failed request — the only failure posture
 * this layer has, so it is measured on its own.
 *
 * <p>With a broken database (no table, no connection): {@code write} does not throw, {@code record} does
 * not throw, and {@code stop}'s flush does not throw. Any of the three throwing would let the trail touch
 * what it must never touch.
 *
 * <p>The drop count is measured on the same surface an operator reads: a full queue is filled by hand,
 * the counter starts at zero, and only the row beyond the cap moves it. A row whose insert fails did not
 * reach the table either, so it moves the same counter — that is what makes the count a shortfall rather
 * than a queue statistic.
 *
 * 写不进库只是一次**少报**，不是一次失败的请求 —— 这是这一层唯一的失败姿态，故单独量它。
 *
 * <p>库坏（表不在、连不上）时：{@code write} 不抛、{@code record} 不抛、{@code stop} 的收尾不抛。三者任何
 * 一个抛出去，留痕就会影响它本该完全不碰的东西。
 *
 * 丢弃数在操作者读的同一个面上量：队列由测试亲手填满，计数器从 0 开始，只有越过容量的那一行让它动。插入
 * 失败的行同样没进表，因此也动同一个计数器 —— 这才让这个数代表留痕的缺口，而不是一条队列统计。
 */
class YudaoBypassAuditJdbcSinkTest {

    private static final YudaoBypassAuditRow ROW = new YudaoBypassAuditRow(
            Instant.parse("2026-10-30T12:00:00Z"), "POST", "/admin-api/crm/contract/create",
            "crm", "contract", 100L, 1L, 200, 0, 12L, 44, "0123456789ab", "customerId,note");

    @Test
    void aBrokenDatabaseIsLoggedRatherThanThrown() throws SQLException {
        YudaoBypassAuditJdbcSink sink =
                new YudaoBypassAuditJdbcSink(brokenDataSource(), new SimpleMeterRegistry());
        try {
            assertDoesNotThrow(() -> sink.write(ROW),
                    "an insert that cannot run is a missing record, never an exception");
            assertDoesNotThrow(() -> sink.record(ROW),
                    "handing a row over must not depend on the database being there");
        } finally {
            assertDoesNotThrow(sink::stop, "shutdown flushes what it can and still does not throw");
        }
    }

    @Test
    void aFullQueueDropsAndTheCountIsReadableFromTheMeterRegistry() throws SQLException {
        SimpleMeterRegistry meters = new SimpleMeterRegistry();
        BlockingQueue<YudaoBypassAuditRow> queue =
                new ArrayBlockingQueue<>(YudaoBypassAuditJdbcSink.QUEUE_CAPACITY);
        YudaoBypassAuditJdbcSink sink =
                new YudaoBypassAuditJdbcSink(brokenDataSource(), meters, queue);

        Counter dropped = meters.get(YudaoBypassAuditJdbcSink.DROPPED_METRIC).counter();
        assertEquals(0.0, dropped.count(), "an empty queue has dropped nothing");

        for (int i = 0; i < YudaoBypassAuditJdbcSink.QUEUE_CAPACITY; i++) {
            sink.record(ROW);
        }
        assertEquals(0.0, dropped.count(),
                "a queue filled exactly to capacity has still dropped nothing");

        sink.record(ROW);
        assertTrue(dropped.count() > 0,
                "the row beyond the cap is dropped, and the drop is readable where an operator reads it");
        assertEquals(1.0, dropped.count(), "one row beyond the cap is exactly one dropped row");
    }

    @Test
    void aRowTheDatabaseRefusesIsCountedAsDropped() throws SQLException {
        SimpleMeterRegistry meters = new SimpleMeterRegistry();
        YudaoBypassAuditJdbcSink sink = new YudaoBypassAuditJdbcSink(brokenDataSource(), meters,
                new ArrayBlockingQueue<>(YudaoBypassAuditJdbcSink.QUEUE_CAPACITY));

        sink.write(ROW);
        sink.write(ROW);

        assertEquals(2.0, meters.get(YudaoBypassAuditJdbcSink.DROPPED_METRIC).counter().count(),
                "each insert the database refuses never reached the table, so each one is a dropped row");
    }

    @Test
    void queueOverflowAndFailedInsertsShareTheOneDropCount() throws SQLException {
        SimpleMeterRegistry meters = new SimpleMeterRegistry();
        YudaoBypassAuditJdbcSink sink = new YudaoBypassAuditJdbcSink(brokenDataSource(), meters,
                new ArrayBlockingQueue<>(2));

        sink.write(ROW);   // the insert fails: one row lost
        sink.record(ROW);
        sink.record(ROW);  // the queue is now exactly full
        sink.record(ROW);  // the full queue refuses this one: a second row lost

        assertEquals(2.0, meters.get(YudaoBypassAuditJdbcSink.DROPPED_METRIC).counter().count(),
                "the count is the trail's shortfall, whichever cause produced it");
    }

    private static DataSource brokenDataSource() throws SQLException {
        DataSource dataSource = mock(DataSource.class);
        when(dataSource.getConnection()).thenThrow(new SQLException("no database here"));
        return dataSource;
    }
}
