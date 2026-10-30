// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.effect.SideEffect;
import cn.com.keelbase.runtime.effect.SideEffectCompensator;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.crm.service.customer.CrmCustomerService;
import cn.iocoder.yudao.module.crm.service.followup.CrmFollowUpRecordService;
import cn.iocoder.yudao.module.products.service.products.ProductsService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The host's local compensation seam: one compensator per result type this host's own writes produce, so
 * that a withdrawal reaches the module that made the row rather than a demo entity it does not know.
 *
 * <p>Before this, the runtime's {@code local_compensate} path named the sample module's follow-up and
 * nothing else, so a withdrawal of a {@code crm_customer} or a {@code products} write was refused before
 * any audit line went down — which is why the conformance record's {@code Revoke} column could read
 * nothing but {@code SKIP}. See {@code D37} for the seam and {@code YD-9} for this half.
 *
 * <p><b>One result type can cover two tools, and undoing a create is not undoing an update.</b>
 * {@code crm_customer} is exactly that case here: a create is compensated by deleting the row, an update
 * is refused — this runtime records no before-snapshot, so there is no earlier shape to put the row back
 * to, and a compensator that only deleted would silently compensate an update wrongly. Refusing throws,
 * which aborts the whole withdrawal and leaves no audit line: the honest outcome, not a pretended one.
 *
 * <p>The caller and the tenant travel the way they do for the tools ({@link ActingCaller} and
 * {@link YudaoCallerTenant}): the module's own advices and its tenant interceptor both read them, and a
 * generated module's delete is itself a governed call.
 *
 * 宿主的本地补偿缝：本宿主自己的写所产出的**每种结果类型**各配一个补偿器，使一次撤销到达**真正建了那一行的模块**，
 * 而不是它并不认识的一个样例实体。
 *
 * <p>在这之前，运行时的 `local_compensate` 路只点名样例模块的 follow-up、别的什么都不认，于是一次对 `crm_customer`
 * 或 `products` 写的撤销**在审计行之前就被拒**——门禁记录的 `Revoke` 栏因此只可能读到 `SKIP`。见 `D37`（那条缝）与
 * `YD-9`（本半）。
 *
 * <p>**一个结果类型可以盖住两个工具，而撤销一次建不等于撤销一次改。** `crm_customer` 在这里正是这种情形：**建**的
 * 补偿是删掉那一行，**改**的被拒——本运行时**不记 before 快照**，没有可放回去的早先样子，而一个只删的补偿器会**安静地**
 * 把一次改补偿错。拒绝以抛异常表达：它**中止整次撤销、且不留审计行**——那是诚实的结局，不是装出来的。
 *
 * <p>调用方与租户**以与工具相同的方式**传递（`ActingCaller` 与 `YudaoCallerTenant`）：模块自己的切面与它的租户拦截器
 * 都会读它们，而生成模块的删除**本身就在治理之下**。
 *
 * <p>**补偿器随它的模块走（`YD-44`）。** 新接入模块的补偿器**不再**往本类里追加 bean —— 它由那个模块自己的
 * `*Governance` 以 `@Bean` 提供，本类只留三样东西：最初的三个补偿器、上面那份共用说明、以及三个可复用的静态小件
 * （`as` / `asId` / `requireCreate`）。判据：新模块的「宿主级件」为 **0 行**（`接入成本判据_2026-10-29.md` §5.1）。
 *
 * <p><b>A compensator travels with its module (`YD-44`).</b> A newly onboarded module no longer appends a bean here:
 * its own `*Governance` declares the `@Bean`. This class keeps only the first three compensators, the shared notes
 * above, and three reusable static helpers (`as`, `asId`, `requireCreate`). The criterion is that a new module's
 * host-level artefacts are **zero lines** (`接入成本判据_2026-10-29.md` §5.1).
 */
@Configuration
public class YudaoLocalCompensators {

    @Bean
    SideEffectCompensator crmCustomerCompensator(CrmCustomerService service) {
        return new CrmCustomerCompensator(service);
    }

    @Bean
    SideEffectCompensator generatedProductsCompensator(ProductsService service) {
        return new GeneratedProductsCompensator(service);
    }

    @Bean
    SideEffectCompensator crmFollowUpRecordCompensator(CrmFollowUpRecordService service) {
        return new CrmFollowUpRecordCompensator(service);
    }

    /**
     * {@code crm_customer}: a create is deleted, an update is refused.
     *
     * {@code crm_customer}：建的就删，改的拒。
     */
    static final class CrmCustomerCompensator implements SideEffectCompensator {

        private final CrmCustomerService service;

        CrmCustomerCompensator(CrmCustomerService service) {
            this.service = service;
        }

        @Override
        public String resultType() {
            return "crm_customer";
        }

        @Override
        public void compensate(SideEffect effect) {
            requireCreate(effect);
            as(effect, () -> service.deleteCustomer(effect.getResultId()));
        }
    }

    /**
     * {@code products}: the adapter's generated module only ever creates, so the row is deleted.
     *
     * {@code products}：适配器生成的模块只会建，故删掉那一行。
     */
    static final class GeneratedProductsCompensator implements SideEffectCompensator {

        private final ProductsService service;

        GeneratedProductsCompensator(ProductsService service) {
            this.service = service;
        }

        @Override
        public String resultType() {
            return "products";
        }

        @Override
        public void compensate(SideEffect effect) {
            requireCreate(effect);
            as(effect, () -> service.deleteProducts(effect.getResultId()));
        }
    }

    /**
     * {@code crm_follow_up_record}: the flagship tool only ever creates one, so the row is deleted.
     *
     * <p>It does not go through {@link #requireCreate} — that rule reads the naming convention
     * ({@code create_}), and this tool is named for what it records rather than for the verb, so the
     * guarantee is stated here instead of inferred from a prefix.
     *
     * {@code crm_follow_up_record}：旗舰那个工具只会建一条，故删掉那一行。
     *
     * <p>它不走 {@link #requireCreate} —— 那条规则读的是命名约定（{@code create_}），而这个工具按**它记的是什么**命名、
     * 不按动词，故这里把保证**写出来**，而不是从前缀去推。
     */
    static final class CrmFollowUpRecordCompensator implements SideEffectCompensator {

        private final CrmFollowUpRecordService service;

        CrmFollowUpRecordCompensator(CrmFollowUpRecordService service) {
            this.service = service;
        }

        @Override
        public String resultType() {
            return "crm_follow_up_record";
        }

        @Override
        public void compensate(SideEffect effect) {
            if (!"record_crm_followup".equals(effect.getToolName())) {
                throw new IllegalStateException("cannot compensate " + effect.getToolName()
                        + " locally: only a recorded follow-up can be taken back here");
            }
            as(effect, () -> service.deleteFollowUpRecord(effect.getResultId(), asId(effect.getUserId())));
        }
    }

    /** 调用方在副作用行上是字符串；`deleteFollowUpRecord` 要的是数字。包内可见：模块自己的补偿器也用（`YD-44`）。 */
    static Long asId(String value) {
        try {
            return value == null ? null : Long.valueOf(value);
        } catch (NumberFormatException notAnId) {
            return null;
        }
    }

    /**
     * Only a create can be undone here, and saying why when it cannot is the point: the refusal names the
     * missing piece instead of quietly doing the wrong thing.
     *
     * 这里只有**建**撤得动，而撤不动时说清为什么才是要点：拒绝**点名缺的是什么**，而不是悄悄做错。
     */
    static void requireCreate(SideEffect effect) {
        if (!effect.getToolName().startsWith("create_")) {
            throw new IllegalStateException("cannot compensate " + effect.getToolName()
                    + " locally: this runtime records no before-snapshot, so the row cannot be put back");
        }
    }

    /**
     * Run the compensation the way this host runs a tool — under the caller that made the write, and
     * under the tenant that call ran in. Both are read by the module's own advices and by the data layer,
     * and a missing tenant makes the data layer refuse to run at all.
     *
     * 以本宿主跑工具的方式跑补偿——在**做出那笔写的调用方**下、在**那次调用所处的租户**下。两者都会被模块自己的切面
     * 与数据层读到，而**缺租户会让数据层直接拒跑**。
     */
    static void as(SideEffect effect, Runnable body) {
        ActingCaller.as(effect.getUserId(),
                () -> TenantUtils.execute(YudaoCallerTenant.current(), () -> {
                    body.run();
                    return null;
                }));
    }
}
