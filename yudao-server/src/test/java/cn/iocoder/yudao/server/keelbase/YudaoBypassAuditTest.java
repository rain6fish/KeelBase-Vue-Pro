// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;

/**
 * 开关的语义是「不装」，不是「装了但不记」—— 故红绿看的是**容器里有没有那个过滤器**，而不是它跑没跑。
 *
 * <p>关掉时必须一个 bean 都没有：请求路径上少一个过滤器，「没有任何行为变化」才不需要被相信。
 *
 * <p>The switch means "not installed", not "installed but silent" — so red and green read whether the
 * filter **is in the container**, not whether it ran.
 *
 * <p>Off must leave no bean at all: one fewer filter on the request path is what makes "nothing behaves
 * differently" need no trust.
 */
class YudaoBypassAuditTest {

    @Test
    void installedWhenTheSwitchIsAbsent() {
        try (AnnotationConfigApplicationContext context = context(Map.of())) {
            assertEquals(1, context.getBeansOfType(FilterRegistrationBean.class).size(),
                    "the layer exists because nothing was recorded; absent key means on");
        }
    }

    @Test
    void installedWhenTheSwitchSaysSo() {
        try (AnnotationConfigApplicationContext context =
                     context(Map.of("keelbase.bypass-audit.enabled", "true"))) {
            assertEquals(1, context.getBeansOfType(FilterRegistrationBean.class).size());
        }
    }

    @Test
    void notInstalledWhenTheSwitchIsOff() {
        try (AnnotationConfigApplicationContext context =
                     context(Map.of("keelbase.bypass-audit.enabled", "false"))) {
            assertTrue(context.getBeansOfType(FilterRegistrationBean.class).isEmpty(),
                    "off is an absence, so 'behaviour unchanged' is not a promise to be believed");
        }
    }

    private static AnnotationConfigApplicationContext context(Map<String, Object> properties) {
        AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext();
        context.getEnvironment().getPropertySources()
                .addFirst(new MapPropertySource("bypass-audit-test", properties));
        context.registerBean(YudaoBypassAuditSink.class, () -> (YudaoBypassAuditSink) row -> { });
        context.register(YudaoBypassAudit.class);
        context.refresh();
        return context;
    }
}
