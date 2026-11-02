// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import jakarta.annotation.PreDestroy;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 把旁路留痕写进 `keelbase_bypass_log`：**异步、有界、失败只写日志**。
 *
 * <p>三条都是刻意的，而且每条都能被读成一次拒绝：
 *
 * <ul>
 *   <li><b>异步</b>：请求线程只 {@code offer} 一行就回去。一条写请求的耗时不因为多了一张留痕表而变长 ——
 *       这一层「不改行为」的读数里，耗时就包含在内。</li>
 *   <li><b>有界</b>：队列满了就**丢**，并记下丢了多少。反过来（阻塞请求线程等空位）会让一张记满日志的表
 *       把整台宿主拖停 —— 一个只负责留痕的组件没有这个资格。丢行的计数是这条取舍的痕迹，读得出来。</li>
 *   <li><b>失败只写日志</b>：插入抛错（表不在、库断了、类型不对）只报警，不重试、不回传。留痕缺席是一次
 *       **少报**，不是一次失败的写。</li>
 * </ul>
 *
 * <p><b>为什么不走 MyBatis 或运行时那张审计表。</b>走 MyBatis 会过芋道的租户拦截器（这张表按调用时的租户
 * **当数据**存，不该被它按租户过滤）；走运行时的 `ai_audit_logs` 会把留痕混进审计链 —— 而分开正是这一层
 * 存在的理由。故这里直接拿 {@link DataSource} 建一个 {@link JdbcTemplate}，与 `YudaoCallerDirectory`、
 * `YudaoRecordNames` 同一种做法（不额外向容器要一个 bean）。
 *
 * <p>Writes the bypass trail into `keelbase_bypass_log`: **asynchronous, bounded, failures logged only**.
 *
 * <p>All three are deliberate, and each one is a refusal worth being able to read:
 *
 * <ul>
 *   <li><b>Asynchronous</b> — the request thread offers a row and returns. A write does not get slower
 *       because a trail table exists; request latency is part of "this layer changes no behaviour".</li>
 *   <li><b>Bounded</b> — a full queue **drops** and counts the drop. The other way (block the request
 *       thread until there is room) lets a full trail table stop the whole host, which a
 *       record-only component has no business doing. The drop counter is the trace of that trade.</li>
 *   <li><b>Failures logged only</b> — an insert that throws (missing table, dead database, type
 *       mismatch) warns and stops. A missing trail row is a **shallow** record, not a failed write.</li>
 * </ul>
 *
 * <p><b>Why not MyBatis, and why not the runtime's audit table.</b> MyBatis would run the tenant
 * interceptor (this table stores the caller's tenant **as data** and must not be filtered by it), and the
 * runtime's `ai_audit_logs` would mix the trail into the audit chain — keeping them apart is why this
 * layer exists at all. So a {@link JdbcTemplate} is built from the {@link DataSource}, the way
 * `YudaoCallerDirectory` and `YudaoRecordNames` already do it.
 */
@Component
@ConditionalOnProperty(prefix = "keelbase.bypass-audit", name = "enabled",
        havingValue = "true", matchIfMissing = true)
public class YudaoBypassAuditJdbcSink implements YudaoBypassAuditSink {

    private static final Logger LOG = LoggerFactory.getLogger(YudaoBypassAuditJdbcSink.class);

    /**
     * 队列容量。取 1024：一段突发（比如一次批量删除）放得下，而一张 1024 行的表在内存里也不值得担心。
     * 满了丢 —— 见类注释。
     *
     * <p>The queue's capacity. 1024 holds a burst (a bulk delete, say), and 1024 rows in memory is
     * nothing to worry about. Full means drop — see the class note.
     */
    static final int QUEUE_CAPACITY = 1024;

    /** 一条插入语句，一处写死：列与表名都在 `sql/keelbase-bypass-audit.sql`。 */
    private static final String INSERT = "insert into keelbase_bypass_log "
            + "(occurred_at, method, path, module, object_name, caller_id, tenant_id, "
            + "http_status, result_code, duration_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    private final BlockingQueue<YudaoBypassAuditRow> queue = new ArrayBlockingQueue<>(QUEUE_CAPACITY);
    private final AtomicLong dropped = new AtomicLong();
    private final DataSource dataSource;
    private final Thread writer;
    private volatile JdbcTemplate jdbc;

    public YudaoBypassAuditJdbcSink(DataSource dataSource) {
        this.dataSource = dataSource;
        this.writer = new Thread(this::drain, "keelbase-bypass-audit");
        // 守护线程：一个只负责留痕的回收端不该拦住 JVM 退出。
        // A daemon thread: a record-only drainer must not hold the JVM open.
        this.writer.setDaemon(true);
        this.writer.start();
    }

    @Override
    public void record(YudaoBypassAuditRow row) {
        if (row == null) {
            return;
        }
        if (!queue.offer(row)) {
            // 有界队列满了：丢，并计数。每 100 次说一句 —— 每次都说会把日志变成噪声，永不说则读不出在丢。
            // A full bounded queue drops, counted. Said once per hundred: every time is noise, never is
            // a drop nobody can read.
            long lost = dropped.incrementAndGet();
            if (lost % 100 == 1) {
                LOG.warn("bypass trail queue is full; {} row(s) dropped so far", lost);
            }
        }
    }

    /** 回收端：一条一条取，一条一条写。被中断即退出，退出前把手上剩下的尽力写完。 */
    /** The drainer: takes one row at a time and writes it. Interruption ends it, after a bounded flush. */
    private void drain() {
        while (!Thread.currentThread().isInterrupted()) {
            try {
                YudaoBypassAuditRow row = queue.poll(1, TimeUnit.SECONDS);
                if (row != null) {
                    write(row);
                }
            } catch (InterruptedException stopping) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    /**
     * 一条插入。**吞掉一切运行时失败**：调用方是回收端，而这个类的承诺是「留痕不影响任何别的东西」。
     *
     * <p>One insert. **It swallows every runtime failure**: the caller is the drainer, and this class's
     * promise is that a trail never affects anything else.
     */
    void write(YudaoBypassAuditRow row) {
        try {
            // 时间列是 `timestamptz`，故交出去的类型是 `OffsetDateTime` 而不是 `Instant`：驱动认不了后者（它把
            // 「这个类型我推断不出」报成一句 SQL 语法错），而 `OffsetDateTime` 正是 timestamptz 对得上的那一种。
            // The column is `timestamptz`, so the value handed over is an `OffsetDateTime`, not an `Instant`:
            // the driver cannot infer the latter (it reports "cannot infer the type" as a SQL grammar error),
            // and `OffsetDateTime` is what a timestamptz lines up with.
            jdbc().update(INSERT, OffsetDateTime.ofInstant(row.occurredAt(), ZoneOffset.UTC),
                    row.method(), row.path(),
                    row.module(), row.object(), row.callerId(), row.tenantId(),
                    row.httpStatus(), row.resultCode(), row.durationMs());
        } catch (RuntimeException failed) {
            // 报**最里层**那句：`BadSqlGrammarException` 只说「语法不对」，而真正的原因（表不在这个 schema、
            // 库连错了、类型对不上）在它的 cause 里。一条读不出原因的警告，等于让人去猜。
            // Name the **innermost** message: `BadSqlGrammarException` only says "bad grammar", and the reason
            // — the table is in another schema, the wrong database, a type that does not line up — is in its
            // cause. A warning that cannot be read is a warning somebody has to guess about.
            String reason = failed instanceof DataAccessException dataAccess
                    ? dataAccess.getMostSpecificCause().toString()
                    : failed.toString();
            LOG.warn("bypass trail row not written ({} {}): {}", row.method(), row.path(), reason);
        }
    }

    /**
     * 停：中断回收端，再把它手上剩下的写完（**有上限**的收尾 —— 关机不该等一个坏掉的库）。
     *
     * 停机时剩下的行本来会随队列一起消失，而一次发布正是一段集中写入的时刻；有界收尾让它们大多留住，
     * 又不让关闭卡在一个写不动的库上。
     *
     * <p>Stops: interrupts the drainer, then flushes what is left, **bounded** — shutdown must not wait on
     * a broken database. The rows left in the queue would otherwise vanish with it, and a release is
     * exactly when writes cluster; a bounded flush keeps most of them without hanging the shutdown.
     */
    @PreDestroy
    void stop() {
        writer.interrupt();
        List<YudaoBypassAuditRow> left = new ArrayList<>();
        queue.drainTo(left);
        for (YudaoBypassAuditRow row : left) {
            write(row);
        }
        if (!left.isEmpty()) {
            LOG.info("bypass trail flushed {} row(s) at shutdown", left.size());
        }
        if (dropped.get() > 0) {
            LOG.warn("bypass trail dropped {} row(s) in total", dropped.get());
        }
    }

    private JdbcTemplate jdbc() {
        JdbcTemplate template = jdbc;
        if (template == null) {
            synchronized (this) {
                template = jdbc;
                if (template == null) {
                    template = new JdbcTemplate(dataSource);
                    jdbc = template;
                }
            }
        }
        return template;
    }
}
