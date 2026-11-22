// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Refuses a query parameter the audit read face does not declare, naming the field.
 *
 * <p>Why this exists: Spring drops a query parameter the handler never declared without an error, so
 * `GET /audit/logs?tenantId=121` answered the whole chain. A reader that asked for a filter and got an
 * unfiltered list cannot tell the difference from the answer alone, which is the same failure F10
 * recorded for half an object filter — the answer looks filtered and is not. The runtime already
 * refuses the filters it knows it cannot apply (`agentId`, `orgId`, `denied`, half an object pair);
 * this guard covers the other direction: a name the read face has never heard of.
 *
 * <p>Where it is enforced: the runtime's controller is embedded in this application, so the host sees
 * the parameters before argument resolution. That is the layer that can refuse without touching the
 * runtime repository. A deployment produced by the generator has no host interceptor over its own
 * `/audit/logs`; there the silent drop remains until the generator declares its filters.
 *
 * <p>The declared list mirrors the runtime's `AuditController#logs` at the version this host pins
 * (`keelbase4j-core` 0.1.20). It is a whitelist rather than a blacklist so a name nobody has thought
 * about yet is refused too, not only `tenantId`. Bump this list together with the pin when the
 * runtime's read face gains a parameter; a declared filter that the runtime then refuses
 * (`agentId` and friends) still reaches the runtime and keeps its own 400.
 *
 * <p>用 400 拒绝读面没有声明的查询参数，并点出字段名。
 *
 * <p>为什么要有这道守卫：Spring 对 handler 没声明的查询参数不报错、直接丢弃，于是
 * `GET /audit/logs?tenantId=121` 答回整条链。要了筛选却拿到未筛选列表的读者，光看答复分不出区别 ——
 * 与 F10 记下的「半个对象过滤」是同一种失败：看着像筛过、其实没有。运行时已经拒绝它知道自己施加不了
 * 的筛选（`agentId`、`orgId`、`denied`、半个对象对）；本守卫管另一个方向：读面从没听过的名字。
 *
 * <p>在哪一层拒绝：运行时的控制器嵌在本应用里，宿主在参数解析之前就看得到参数。这正是既能拒绝、又
 * 不必动运行时仓的那一层。生成器产出的部署在自己的 `/audit/logs` 上没有宿主拦截器；那里在生成器自己
 * 声明这些筛选之前仍是静默丢弃。
 *
 * <p>声明清单对齐本宿主所 pin 的运行时（`keelbase4j-core` 0.1.20）的 `AuditController#logs`。用白名单
 * 而不是黑名单，是为了连还没人想到的名字也一并拒绝，而不只是 `tenantId`。运行时的读面新增参数时，这份
 * 清单随 pin 一起更新；运行时自己会拒绝的已声明筛选（`agentId` 等）仍照常到达运行时、保留它自己的 400。
 */
@Component
public class YudaoAuditReadParamsGuard implements HandlerInterceptor {

    /**
     * The parameters `GET /audit/logs` declares at `keelbase4j-core` 0.1.20 — nothing else is applied.
     *
     * <p>Order is for the refusal message only; lookup is by membership.
     *
     * <p>`GET /audit/logs` 在 `keelbase4j-core` 0.1.20 上声明的参数 —— 除此之外它一个都不施加。
     */
    static final List<String> DECLARED_PARAMS = List.of(
            "userId", "since", "until", "objectType", "objectId",
            "isError", "agentId", "orgId", "denied", "limit", "offset");

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        for (String name : request.getParameterMap().keySet()) {
            if (!DECLARED_PARAMS.contains(name)) {
                // Name the field: a caller that guessed wrong has to be able to see which guess it was.
                // 点名字段：猜错的调用方得看得出是哪一次猜错。
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "unknown audit read filter \"" + name + "\": this read face does not apply it, "
                                + "so it would answer a list that looks filtered and is not; declared: "
                                + String.join(", ", DECLARED_PARAMS));
            }
        }
        return true;
    }
}
