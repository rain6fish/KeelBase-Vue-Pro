// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.stereotype.Component;

/**
 * 治理层的上下文测试：把本包里的每一个 Spring 声明装进一个**真容器**，看它们能不能装配起来。
 *
 * <p>为什么需要它。这一层（切面、工具面、补偿器、登记处，共 47 个类、约 1,500 行）此前只有场景门禁在保 ——
 * 门禁跑的是**行为**，而「这些 bean 能不能被容器装起来」从来没有一条单测问过：一个重复的工具名、一条指向
 * 没人声明过的工具的路由、一个漏了依赖的构造器，都要等到真宿主启动时才炸。这条测试把那个时刻提前到构建里。
 *
 * <p>做法：扫描本包所有 {@code @Component}（含 {@code @Configuration}），按它们的构造器、{@code @Bean}
 * 方法参数与 {@code @Autowired} 字段**逐个注册 mock**，然后刷新容器。它不连数据库、不起 Web 容器、不碰
 * 模型 —— 装配失败就是装配失败，与运行期数据无关。
 *
 * <p>The governance layer's context test: every Spring declaration in this package is put into a real
 * container, and the result is asserted. Why it exists: this layer (aspects, tool faces, compensators,
 * the registry — 47 classes, about 1,500 countable lines) was guarded only by the scenario gate, which
 * exercises <em>behaviour</em>; nothing asked whether these beans can be wired at all. A duplicated
 * tool name, a route pointing at a tool nobody declared, or a constructor missing a dependency would
 * only surface when a real host starts. This test moves that moment into the build.
 *
 * <p>How: scan the package for {@code @Component} (which includes {@code @Configuration}), register a
 * mock for every dependency they declare — constructor parameters, {@code @Bean} method parameters and
 * {@code @Autowired} fields — then refresh. No database, no web server, no model: a wiring failure is
 * a wiring failure, independent of runtime data.
 */
class YudaoGovernanceContextTest {

    private static AnnotationConfigApplicationContext context;

    @BeforeAll
    static void bootTheGovernanceLayer() {
        List<Class<?>> declarations = governanceDeclarations();
        assertFalse(declarations.isEmpty(), "the scan found no governance declarations at all");

        context = new AnnotationConfigApplicationContext();
        declarations.forEach(context::register);
        registerMocksFor(context, declarations);
        context.refresh();
    }

    @AfterAll
    static void closeTheContext() {
        if (context != null) {
            context.close();
        }
    }

    @Test
    void theRegistryStarts() {
        assertNotNull(context.getBean(GovernedModuleRegistry.class));
    }

    @Test
    void everyToolFaceDeclaresItselfConsistently() {
        var tools = context.getBeansOfType(AiTool.class);
        assertFalse(tools.isEmpty(), "no AiTool bean was produced — the tool faces are not wired");

        Set<String> names = new LinkedHashSet<>();
        for (var entry : tools.entrySet()) {
            AiTool tool = entry.getValue();
            assertFalse(tool.name() == null || tool.name().isBlank(), entry.getKey() + " has no name");
            assertFalse(tool.description() == null || tool.description().isBlank(),
                    tool.name() + " has no description");
            assertFalse(tool.riskLevel() == null || tool.riskLevel().isBlank(),
                    tool.name() + " has no risk level");
            assertTrue(names.add(tool.name()),
                    "two tools answer to the same name: " + tool.name());
        }
    }

    @Test
    void everyRoutePointsAtAToolThatExists() {
        var tools = context.getBeansOfType(AiTool.class).values().stream()
                .map(AiTool::name)
                .collect(Collectors.toSet());
        var routes = context.getBeansOfType(ModuleRoute.class);
        assertFalse(routes.isEmpty(), "no ModuleRoute bean was produced");

        for (var entry : routes.entrySet()) {
            String toolName = entry.getValue().toolName();
            assertFalse(toolName == null || toolName.isBlank(), entry.getKey() + " names no tool");
            assertTrue(tools.contains(toolName),
                    entry.getKey() + " proposes \"" + toolName + "\", which no tool face declares");
        }
    }

    /**
     * 生成模块的路由不得与手写的路由抢同一个短语。
     *
     * <p>路由按 bean 顺序取第一个匹配，且匹配是子串包含 —— 生成模块的 `添加产品` 会被手写
     * `CrmProductTools` 的 `加产品` 抢走（2026-11-02 的真栈门抓到）。生成器的六条短语因此都带「生成」标记；
     * 这条测试把「互不包含」固定下来，任何一侧以后改词都会在这里红。
     *
     * A generated route must not claim a phrase a hand-written route also claims. Routing takes the first
     * matching bean and matches by substring, so `添加产品` lost to the hand-written `加产品` (found by the
     * real-stack gate on 2026-11-02). The generator's six phrases carry the "生成" marker now; this test
     * pins the disjointness, so either side changing its words fails here.
     */
    @Test
    void aGeneratedRouteDoesNotClaimAHandwrittenPhrase() {
        List<ModuleRoute> generated = new ArrayList<>();
        List<ModuleRoute> handwritten = new ArrayList<>();
        for (ModuleRoute route : context.getBeansOfType(ModuleRoute.class).values()) {
            boolean fromGeneratedPackage = route.getClass().getName().contains(".generated.");
            (fromGeneratedPackage ? generated : handwritten).add(route);
        }
        assertFalse(generated.isEmpty(), "the generated module's routes are not registered");
        for (ModuleRoute generatedRoute : generated) {
            for (ModuleRoute handwrittenRoute : handwritten) {
                for (String claimed : generatedRoute.triggers()) {
                    for (String taken : handwrittenRoute.triggers()) {
                        assertFalse(claimed.contains(taken) || taken.contains(claimed),
                                "generated route " + generatedRoute.toolName() + " claims \"" + claimed
                                        + "\", which overlaps hand-written " + handwrittenRoute.toolName()
                                        + "'s \"" + taken + "\"");
                    }
                }
            }
        }
    }

    private static List<Class<?>> governanceDeclarations() {
        var scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(Component.class));
        List<Class<?>> found = new ArrayList<>();
        for (BeanDefinition definition : scanner.findCandidateComponents("cn.iocoder.yudao.server.keelbase")) {
            try {
                found.add(Class.forName(definition.getBeanClassName()));
            } catch (ClassNotFoundException e) {
                throw new IllegalStateException(
                        "scanned a class that cannot be loaded: " + definition.getBeanClassName(), e);
            }
        }
        return found;
    }

    /**
     * 为每个声明类所需的依赖注册一个 mock。依赖来自三处：构造器参数、{@code @Bean} 方法参数、
     * {@code @Autowired} 字段。已经作为声明注册过的类型跳过 —— 那一个由容器自己提供；JDK 与 Spring
     * 自带类型也跳过 —— 容器自己会给（{@code Environment} 之类），mock 它们反而会盖掉真实现。
     *
     * <p>Registers a mock for every dependency the declarations ask for, taken from three places:
     * constructor parameters, {@code @Bean} method parameters and {@code @Autowired} fields. Types
     * that are themselves declarations are skipped — the container supplies those; JDK and Spring
     * types are skipped too, because the container supplies them and a mock would shadow the real one.
     */
    private static void registerMocksFor(AnnotationConfigApplicationContext ctx, List<Class<?>> declarations) {
        Set<Class<?>> declared = new LinkedHashSet<>(declarations);
        Set<Class<?>> dependencies = new LinkedHashSet<>();
        for (Class<?> type : declarations) {
            for (Constructor<?> constructor : type.getDeclaredConstructors()) {
                dependencies.addAll(List.of(constructor.getParameterTypes()));
            }
            for (Method method : type.getDeclaredMethods()) {
                if (method.isAnnotationPresent(Bean.class)) {
                    dependencies.addAll(List.of(method.getParameterTypes()));
                }
            }
            for (Field field : type.getDeclaredFields()) {
                if (field.isAnnotationPresent(Autowired.class)) {
                    dependencies.add(field.getType());
                }
            }
        }

        Set<Class<?>> properties = configurationPropertiesTypes(declarations);
        Set<Class<?>> produced = beanMethodReturnTypes(declarations);
        int index = 0;
        for (Class<?> dependency : dependencies) {
            if (dependency.isPrimitive() || dependency.isArray()
                    || dependency == List.class || dependency == Set.class
                    || suppliedByTheContainer(dependency)
                    || aDeclarationSupplies(dependency, declared)
                    || properties.contains(dependency)
                    || produced.contains(dependency)) {
                continue;
            }
            Object configuration = configurationPojo(dependency);
            if (configuration != null) {
                ctx.getBeanFactory().registerSingleton("configuration" + index++, configuration);
                continue;
            }
            ctx.getBeanFactory().registerSingleton("mockDependency" + index++, mock(dependency));
        }
    }

    /**
     * `@EnableConfigurationProperties` 点名的类型由容器在 refresh 时注册，**不**该被 mock。
     *
     * <p>为什么只能从注解读、不能问容器：那些 bean 由 `ConfigurationClassPostProcessor` 在 refresh 阶段导入，
     * 本方法跑在 refresh **之前**——问 bean factory 会答「没有」（问 context 更会直接抛「尚未 refresh」）。
     * 读注解是唯一在此时可得的答案。丁的 `YudaoBypassAudit.Properties` 就是这样撞出两个候选的。
     *
     * <p>The types named by `@EnableConfigurationProperties` are registered by the container during refresh and must
     * not be mocked. They cannot be asked for: the definitions are imported by `ConfigurationClassPostProcessor` during
     * refresh, and this runs **before** it — the bean factory answers "none" and the context throws "not refreshed yet".
     * Reading the annotation is the only answer available here; the bypass audit's `Properties` is what collided.
     */
    /**
     * `@ConfigurationProperties` 的类**不是外部服务**，它自带默认值；给 mock 会让它的字段全为 null，而某个 `@Bean`
     * 方法在装配时读这些字段就会炸（`WebProperties.getAdminApi()` 返回 null 就这样让本测试红过）。故给**真实实例**。
     *
     * <p>A `@ConfigurationProperties` class is **not** an external service: it carries defaults, and a mock leaves
     * every field null — which blows up any `@Bean` method that reads one while wiring (a null `adminApi` on
     * `WebProperties` did exactly that). A real instance is the right dependency here.
     */
    private static Object configurationPojo(Class<?> dependency) {
        if (!dependency.isAnnotationPresent(ConfigurationProperties.class)) {
            return null;
        }
        try {
            return dependency.getDeclaredConstructor().newInstance();
        } catch (ReflectiveOperationException notAConfigurationPojo) {
            return null;
        }
    }

    /**
     * 某个 `@Bean` 方法**返回**的类型也由本包提供，不该再 mock —— 参数类型与返回类型会撞成两个候选
     * （丁的 `YudaoBypassAuditWriter` 就是这样）。
     *
     * <p>A type that some `@Bean` method **returns** is supplied by the package too and must not be mocked; the
     * parameter type and the produced type otherwise collide into two candidates (the bypass audit's writer did).
     */
    private static Set<Class<?>> beanMethodReturnTypes(List<Class<?>> declarations) {
        Set<Class<?>> types = new LinkedHashSet<>();
        for (Class<?> type : declarations) {
            for (Method method : type.getDeclaredMethods()) {
                if (method.isAnnotationPresent(Bean.class)) {
                    types.add(method.getReturnType());
                }
            }
        }
        return types;
    }

    private static Set<Class<?>> configurationPropertiesTypes(List<Class<?>> declarations) {
        Set<Class<?>> types = new LinkedHashSet<>();
        for (Class<?> type : declarations) {
            EnableConfigurationProperties declared = type.getAnnotation(EnableConfigurationProperties.class);
            if (declared != null) {
                types.addAll(List.of(declared.value()));
            }
        }
        return types;
    }


    /**
     * 依赖类型**被某个声明类实现/继承**时，由那一个 bean 提供，不再给接口塞 mock ——
     * 否则同一个接口会有两个候选（{@code IdentityResolver} 就这样撞上过）。
     *
     * <p>When a declaration implements or extends the dependency type, that bean supplies it; mocking
     * the interface as well would leave two candidates — which is exactly how {@code IdentityResolver}
     * collided the first time this test ran.
     */
    private static boolean aDeclarationSupplies(Class<?> dependency, Set<Class<?>> declared) {
        for (Class<?> candidate : declared) {
            if (dependency.isAssignableFrom(candidate)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 只有这几样是容器**自己**一定给的（环境、上下文、事件总线、资源加载、消息源）；其余 Spring 类型
     * 例如 {@code PlatformTransactionManager} 在空容器里并不存在，必须 mock，否则装配直接失败。
     *
     * <p>跳过只看 JDK 的 {@code java.*}：{@code javax.*} **不是**容器自带 —— 空容器里没有
     * {@code javax.sql.DataSource}，跳过它会让声明的那个 bean 装配不上（F-14 的
     * {@code YudaoCallerDirectory} 就这样让本测试红过）。所以 {@code javax.*} 一律照常 mock。
     *
     * <p>English: only JDK {@code java.*} types are skipped. {@code javax.*} is not container-supplied —
     * a bare context has no {@code javax.sql.DataSource}, and skipping it leaves the declaring bean
     * unwired (which is how F-14's {@code YudaoCallerDirectory} turned this test red). {@code javax.*}
     * dependencies therefore get a mock like any other.
     */
    private static final Set<String> SUPPLIED_BY_THE_CONTAINER = Set.of(
            "org.springframework.core.env.Environment",
            "org.springframework.context.ApplicationContext",
            "org.springframework.context.ApplicationEventPublisher",
            "org.springframework.context.MessageSource",
            "org.springframework.beans.factory.BeanFactory",
            "org.springframework.core.io.ResourceLoader");

    private static boolean suppliedByTheContainer(Class<?> type) {
        String name = type.getName();
        return name.startsWith("java.")
                || SUPPLIED_BY_THE_CONTAINER.contains(name);
    }
}
