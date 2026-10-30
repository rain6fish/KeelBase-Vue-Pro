// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.effect.SideEffect;
import cn.com.keelbase.runtime.effect.SideEffectCompensator;
import cn.iocoder.yudao.module.fms.controller.admin.voucher.vo.FmsVoucherPageReqVO;
import cn.iocoder.yudao.module.fms.dal.dataobject.voucher.FmsVoucherDO;
import cn.iocoder.yudao.module.fms.dal.mysql.voucher.FmsVoucherMapper;
import cn.iocoder.yudao.module.fms.service.voucher.FmsVoucherService;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.context.annotation.Bean;
import org.springframework.stereotype.Component;

/**
 * FMS 在其**模块自己的接缝**上的治理，治理的是记账凭证——继 CRM、BPM 请假、系统站内信之后**第四个**上游写的模块，
 * 也是**第一个非 CRM** 的（`YD-28`）。它来回答的是那个问题本身：**同一套机器，第四次接线要花多少**。
 *
 * <p><b>属主既不是行上的专列、也不是入参——这一次它是「模块自己查询里的一个筛选位」。</b>CRM 的属主是行上的
 * {@code owner_user_id}，BPM 的是入参里的用户 id。FMS 两样都不是：{@code fms_voucher} 上根本没有专列，只有
 * MyBatis-Plus 自动填的审计串 {@code creator}（`DefaultDBFieldHandler` 填的是 {@code userId.toString()}）；而模块
 * 自己的分页查询**已经**认一个 {@code creatorUserId} 筛选（`FmsVoucherMapper.selectPage` 拿它比 {@code creator}）。
 * 于是收窄在这里**不写代码**：把调用方的 id 放进那个筛选位，**由模块自己的查询**把范围收掉。
 *
 * <p><b>收窄到「自己录的」比模块更严，这是声明的收窄。</b>模块按**账套**授权（{@code fms_account_user} 的 level），
 * 同一账套里别人录的凭证本来也看得见。本通知只让调用方看见**自己录的**，故它**比模块更严、不是等于**；放宽到
 * 「账套内可见」是对这个宿主词表的决定，此处留而未决——接入文件要求每个模块交待这句话，这是 FMS 的那一句。
 *
 * <p><b>哪些路不在切点里，以及为什么。</b>切点**就是**这份清单，故边界要写出来：模块还有 create / update /
 * delete-list 三条按 id 的写，本面**都不声明工具**——工具面只有一读一写（分页 + 审核），AI 够不到那三条，
 * 故不为它们写通知。宿主自己的界面照旧自己守自己。
 *
 * FMS's governance at the module's own seam, over the accounting voucher — the fourth upstream module held by
 * KeelBase (CRM, BPM's leave request, system's in-app messages, now this) and the **first that is not CRM**
 * (`YD-28`). What it is here to answer is that question itself: what a **fourth** wiring costs.
 *
 * <p><b>The owner is neither a dedicated column nor an argument — this time it is a filter the module's own query
 * already has.</b> CRM's owner is a row column; BPM's is a service argument. FMS is neither: {@code fms_voucher}
 * has no dedicated owner column, only the audit string {@code creator} that MyBatis-Plus fills with
 * {@code userId.toString()}; and the module's own page query **already** honours a {@code creatorUserId} filter
 * (it compares it against {@code creator}). So the narrowing here **writes no query**: it puts the caller's id in
 * that filter and lets the module's own query do the narrowing.
 *
 * <p><b>Narrowing to "what the caller entered" is stricter than the module, and that is a declared narrowing.</b>
 * The module authorises by **account set** (the level in {@code fms_account_user}), so within one account set
 * other people's vouchers are visible too. This advice shows the caller only their own, so it is **stricter than
 * the module, not equal to it**; widening it to the account set is a decision about this host's vocabulary that is
 * left unmade. The onboarding file owes this sentence for every module; this is FMS's.
 *
 * <p><b>Which paths are not in the pointcuts, and why.</b> The pointcuts **are** that list, so the boundary is
 * written out: the module also has create / update / delete-list, three writes by id, and this face declares **no
 * tools** for them — the face is one read and one write (the page and the review), the AI cannot reach the other
 * three, so no advice is written for them. The host's own console keeps guarding itself.
 */
@Aspect
@Component
public class FmsVoucherGovernance implements GovernedModule {

    private final YudaoModuleScope scope;
    private final FmsVoucherMapper mapper;

    public FmsVoucherGovernance(YudaoModuleScope scope, FmsVoucherMapper mapper) {
        this.scope = scope;
        this.mapper = mapper;
    }

    /**
     * 本模块的补偿器：撤销一次审核 = 把凭证退回「待审核」（`YD-44`）。**它随模块走** —— 不再往宿主的
     * `YudaoLocalCompensators` 里追加 bean，故新模块的宿主级件是 0 行。
     *
     * The module's own compensator: undoing a review puts the voucher back to pending (`YD-44`). It travels with the
     * module — nothing is appended to the host's `YudaoLocalCompensators`, so a new module's host-level artefacts are
     * zero lines.
     */
    @Bean
    SideEffectCompensator fmsVoucherCompensator(FmsVoucherService service, FmsVoucherMapper mapper) {
        return new FmsVoucherCompensator(service, mapper);
    }

    /** Declares this module governed, so the set is countable — see {@link GovernedModuleRegistry}. */
    @Override
    public String module() {
        return "fms";
    }

    /**
     * The column this module's advice reads. Not a dedicated owner column: it is the audit string MyBatis-Plus
     * fills from the login user ({@code userId.toString()}), which is exactly what {@link YudaoModuleScope}
     * compares — it takes the owner as a string.
     *
     * 本模块通知读的那一列。它不是专设的属主列：它是 MyBatis-Plus 从登录用户填的审计串（`userId.toString()`），
     * 而那正是 {@link YudaoModuleScope} 要比的东西——它把属主当字符串收。
     */
    @Override
    public String ownerField() {
        return "creator";
    }

    /**
     * 分页，收窄在**模块自己的查询**里：把调用方的 id 放进它本来就认的 {@code creatorUserId} 筛选位。
     * {@code getVoucherPage} 的签名是 {@code (pageReqVO, userId)} —— **用户 id 是第 1 个实参**，而它是用来判
     * **账套**权限的、不是用来收行范围的（BPM 那边恰好相反：用户 id 在第 0 槽、且就是收窄本身）。故这里改的是
     * 第 0 个实参上的字段，不是第 1 个实参。
     *
     * The page, narrowed **inside the module's own query**: the caller's id goes into the {@code creatorUserId}
     * filter it already honours. {@code getVoucherPage} is {@code (pageReqVO, userId)} — the user id is **argument
     * 1** and it decides **account-set** permission, not row scope (BPM is the mirror image: there the user id is
     * argument 0 and *is* the narrowing). So this rewrites a field on argument 0, not argument 1.
     */
    @Around("execution(* cn.iocoder.yudao.module.fms.service.voucher.FmsVoucherService.getVoucherPage(..))")
    public Object narrowToCaller(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object[] args = call.getArgs();
        if (caller == null || args.length < 1 || !(args[0] instanceof FmsVoucherPageReqVO query)) {
            return call.proceed();
        }
        // 顶掉请求带来的那个：传了别人 id 的路径无法放宽调用方所见。
        // It replaces whatever the request carried — a path naming someone else cannot widen what the caller sees.
        query.setCreatorUserId(caller);
        return call.proceed(args);
    }

    /**
     * 按 id 读：模块只校验账套，故同一账套里**别人录的凭证也会交回**——本通知把它换成空，而不存在的那一行正是
     * 这么答的。
     *
     * A read by id: the module checks only the account set, so **another person's voucher in the same account set
     * comes back** — this answers nothing instead, which is how a row that is not there answers.
     */
    @Around("execution(* cn.iocoder.yudao.module.fms.service.voucher.FmsVoucherService.getVoucher(..))")
    public Object withholdOthersRow(ProceedingJoinPoint call) throws Throwable {
        Object row = call.proceed();
        Long caller = scope.callerToEnforce();
        if (caller != null && row instanceof FmsVoucherDO found
                && !scope.belongsToCaller(found.getCreator(), caller)) {
            return null;
        }
        return row;
    }

    /**
     * 审核那条路收的是**一列 id**（不是 BPM 那样的单个 id），故收窄要逐个查。任何一行不是调用方录的，整次调用
     * 就被拒——而被拒正是落进审计的那一条。模块自己的 {@code updateVoucherReviewStatus} 只校验账套写权限、
     * 目标状态与期间是否开着，**不看这一行归谁**。
     *
     * The review path takes a **list of ids** (not BPM's single one), so the narrowing looks each up. If any row was
     * not entered by the caller the whole call is refused — and the refusal is what lands in the audit. The module's
     * own {@code updateVoucherReviewStatus} checks the account-set write permission, the target status and whether
     * the period is open, and never asks whose row it is.
     */
    @Around("execution(* cn.iocoder.yudao.module.fms.service.voucher.FmsVoucherService.updateVoucherReviewStatus(..))")
    public Object requireOwnership(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object[] args = call.getArgs();
        if (caller != null && args.length >= 2 && args[1] instanceof List<?> ids) {
            for (Object raw : ids) {
                if (raw instanceof Long id) {
                    FmsVoucherDO existing = mapper.selectById(id);
                    scope.requireOwned(existing == null ? null : existing.getCreator(),
                            caller, "FmsVoucher", "update");
                }
            }
        }
        return call.proceed();
    }

    /** `FmsVoucherStatusEnum.PENDING_REVIEW` —— 与工具面写下的那个状态码是同一个值。 */
    private static final Integer FMS_PENDING_REVIEW = 0;

    /**
     * {@code fms_voucher}：本面做出的那笔写是**审核**，故撤销就是**把状态退回待审核** —— 那正是模块自己的 setter
     * 接受的另一种目标状态（`updateVoucherReviewStatus` 只收「待审核」与「已审核」两值），于是撤销用**模块自己的
     * 词汇**表达，而不是绕过它去改那一行。
     *
     * <p>**它不走 `requireCreate`** —— 那条规则读的是命名约定（`create_`），而本工具按**人做的那个动作**命名。故这个
     * 保证**写在这里**，与旗舰那条 follow-up 补偿器写下它自己的保证同一个理由。
     *
     * <p>**账套必须从那一行读，而且要在调用方的上下文里读**：模块的审核按**账套**授权，而凭证表带 `tenant_id`、
     * 宿主的租户拦截器要求上下文里有租户编号 —— 在 `as(...)` 里面读，正是为了让那两样都在。
     *
     * {@code fms_voucher}: the write this face makes is a **review**, so the withdrawal is putting the voucher
     * **back to pending review** — the other target status the module's own setter accepts, so the undo is
     * expressed in the module's own vocabulary instead of editing the row behind its back.
     *
     * <p>**It does not go through {@code requireCreate}** — that rule reads the naming convention ({@code create_}),
     * and this tool is named for the act a person performs. The guarantee is therefore stated here, for the same
     * reason the flagship's follow-up compensator states its own.
     *
     * <p>**The account set has to be read off the row, and read inside the caller's context**: the module's review
     * authorises by **account set**, and the voucher table carries a {@code tenant_id} the host's tenant interceptor
     * wants present — reading inside {@code as(...)} is what puts both of them there.
     *
     * <p>**它随模块走（`YD-44`）**：原先住在宿主的 `YudaoLocalCompensators` 里，搬到这里是为了让新模块不碰平台文件。
     *
     * <p><b>It travels with the module (`YD-44`)</b>: it used to live in the host's `YudaoLocalCompensators`; moving it
     * here is what lets a new module leave the platform files alone.
     */
    static final class FmsVoucherCompensator implements SideEffectCompensator {

        private final FmsVoucherService service;
        private final FmsVoucherMapper mapper;

        FmsVoucherCompensator(FmsVoucherService service, FmsVoucherMapper mapper) {
            this.service = service;
            this.mapper = mapper;
        }

        @Override
        public String resultType() {
            return "fms_voucher";
        }

        @Override
        public void compensate(SideEffect effect) {
            if (!"review_fms_voucher".equals(effect.getToolName())) {
                throw new IllegalStateException("cannot compensate " + effect.getToolName()
                        + " locally: only a review of a voucher can be taken back here");
            }
            YudaoLocalCompensators.as(effect, () -> {
                FmsVoucherDO voucher = mapper.selectById(effect.getResultId());
                if (voucher == null) {
                    throw new IllegalStateException("cannot compensate " + effect.getToolName()
                            + ": no voucher " + effect.getResultId());
                }
                service.updateVoucherReviewStatus(voucher.getAccountSetId(), List.of(effect.getResultId()),
                        FMS_PENDING_REVIEW, YudaoLocalCompensators.asId(effect.getUserId()));
            });
        }
    }
}
