// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.aspectj.lang.annotation.Around;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;

/**
 * 每个 {@code @Around} 点切点名的「类.方法」都真实存在。
 *
 * <p><b>为什么需要它。</b>AspectJ 的表达式是**字符串**：编译期不校验目标，Spring 启动时也不报错——一条点错了
 * 地方的切面，效果是**静默不生效**。本仓的治理接缝正是靠这些字符串成立：上游把 {@code CrmCustomerService}
 * 改名、把一个方法挪到别的接口，切面就一声不响地不再拦任何人。而「数据范围收窄」失效不会有任何症状，
 * 直到有人读到别人的行。
 *
 * <p>做法：扫本包（含 {@code generated/}）里所有带 {@code @Around} 的方法，按
 * {@code execution(* <FQCN>.<method>(..))} 解析出目标，再用反射确认目标类型与目标方法存在（含继承与接口）。
 * 它不启动容器、不连数据库；失败消息点名「哪条切面、点的是什么、缺什么」。
 *
 * <p>它**不**证明收窄写得对——那由每个对象的场景门（越权被拒那条断言）来证。这里只回答一个更便宜、
 * 也更早的问题：**这条切面还点得到东西吗。**
 *
 * <p>Every {@code @Around} pointcut names a class and method that exist. AspectJ expressions are strings:
 * nothing validates them at compile time and Spring says nothing at startup, so a pointcut that misses its
 * target fails **silently** — and a silent failure here means the row-scope narrowing quietly stops holding
 * anyone. This test parses each expression's {@code execution(* <FQCN>.<method>(..))} targets and confirms,
 * by reflection, that the type and the method (inherited or interface-declared included) exist. It does not
 * prove the narrowing is correct — each object's scenario gate does that — only that the advice still has
 * something to advise.
 */
class GovernancePointcutTargetsTest {

    /** `execution(* a.b.C.method(..))` — the shape this host's governance aspects are written in. */
    private static final Pattern EXECUTION =
            Pattern.compile("execution\\(\\*\\s*([\\w.$]+)\\.([\\w$]+)\\(\\s*\\.\\.\\s*\\)\\)");

    private static final String BASE_PACKAGE = "cn.iocoder.yudao.server.keelbase";

    /**
     * A floor, so a scanner that finds nothing cannot pass as "every pointcut resolves". Deliberately well
     * under today's 28: this guards the scanner, not the inventory — the inventory is the coverage ledger's.
     */
    private static final int AT_LEAST_POINTCUTS = 10;

    @Test
    void everyPointcutNamesAMethodThatExists() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter((reader, factory) -> true);
        Set<BeanDefinition> candidates = scanner.findCandidateComponents(BASE_PACKAGE);

        List<String> failures = new ArrayList<>();
        int seen = 0;
        ClassLoader loader = Thread.currentThread().getContextClassLoader();
        for (BeanDefinition candidate : candidates) {
            // `initialize = false`: loading a class to read its annotations must not run its static initialisers.
            Class<?> type = Class.forName(candidate.getBeanClassName(), false, loader);
            for (Method method : type.getDeclaredMethods()) {
                Around around = method.getAnnotation(Around.class);
                if (around == null) {
                    continue;
                }
                Matcher matcher = EXECUTION.matcher(around.value());
                while (matcher.find()) {
                    seen += 1;
                    String targetType = matcher.group(1);
                    String targetMethod = matcher.group(2);
                    Class<?> resolved;
                    try {
                        resolved = Class.forName(targetType, false, loader);
                    } catch (ClassNotFoundException e) {
                        failures.add(String.format("%s.%s 点的是 %s.%s —— 目标类型不存在",
                                type.getSimpleName(), method.getName(), targetType, targetMethod));
                        continue;
                    }
                    boolean present = false;
                    for (Method candidateMethod : resolved.getMethods()) {
                        if (candidateMethod.getName().equals(targetMethod)) {
                            present = true;
                            break;
                        }
                    }
                    if (!present) {
                        failures.add(String.format("%s.%s 点的是 %s.%s —— 目标方法不存在（上游改名或搬家了）",
                                type.getSimpleName(), method.getName(), targetType, targetMethod));
                    }
                }
            }
        }

        failures.sort(Comparator.naturalOrder());
        assertTrue(failures.isEmpty(),
                "有点切点不到东西了（切面会静默失效）：\n  " + String.join("\n  ", failures));
        assertTrue(seen >= AT_LEAST_POINTCUTS,
                "只解析到 " + seen + " 条点切目标，少于下限 " + AT_LEAST_POINTCUTS + " —— 扫描本身可能坏了");
    }
}
