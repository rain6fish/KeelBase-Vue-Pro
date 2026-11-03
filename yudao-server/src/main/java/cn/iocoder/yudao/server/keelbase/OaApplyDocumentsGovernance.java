// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.iocoder.yudao.framework.mybatis.core.dataobject.BaseDO;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.oa.dal.dataobject.officialdoc.OaOfficialDocReceiveDO;
import cn.iocoder.yudao.module.oa.dal.dataobject.seal.OaSealApplyDO;
import cn.iocoder.yudao.module.oa.dal.dataobject.vehicle.OaVehicleApplyDO;
import cn.iocoder.yudao.module.oa.dal.dataobject.vehicle.OaVehicleReturnDO;
import cn.iocoder.yudao.module.system.api.user.AdminUserApi;
import cn.iocoder.yudao.module.system.api.user.dto.AdminUserRespDTO;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * oa 模块在**申请单据族**上的接缝——M3 第三批唯一的缺口，14 个 service 共用同一句话。
 *
 * <p><b>这 14 个对象长什么样，逐条读自模块自己的代码。</b>
 *
 * <ol>
 *   <li><b>属主。</b>多数是 {@code creator}（审计串，行上没有业务列）；用印、用车、还车有真正的 {@code user_id} 列；
 *       <b>收文是例外——属主是 {@code dept_id}</b>，不是人。</li>
 *   <li><b>分页。</b>**已经收了**。{@code getXxxPage(userId, vo)} 把调用方当入参，mapper 里
 *       {@code eq(creator|user_id, userId)}。故本面不需要「分页收窄」——那是 CRM 与钱包的形状，不是这里。</li>
 *   <li><b>按 id 读。</b>**不判权**。{@code getLeaveApply(id)} / {@code getReimbursement(id)} / {@code getSealApply(id)}
 *       等 14 个方法都是一句裸的 {@code mapper.selectById(id)}，返回整行。这是本面要堵的那一处。</li>
 *   <li><b>写。</b>草稿的改与提交在 service 里已判 {@code creator}（{@code validateXxxEditable}），
 *       {@code updateXxxStatus} 则由 <b>BPM 的流程监听器</b>调用，不是人、也不是工具。</li>
 * </ol>
 *
 * <p><b>为什么接「按标识符读」，不是接分页。</b>分页在模块那一层已经收窄，本面再收一次只是重复；
 * 而按 id 读的那一句是**没有收窄的**。故姿态是 {@code KEELBASE-MODULE-ONBOARDING.md} §2.1 的第三形态：
 * 调用方以自己知道的编号点名一行，不是他的行与不存在的行交回**同一个答案**（{@code null}）。
 * 它可证伪：A、B 各一行、外加一个不存在的编号，A 问 B 的行与 A 问不存在的那一行必须可观测形态相同，
 * 而 A 问自己的行必须拿到自己的业务事实；不接时第一条会拿到 B 的行。
 *
 * <p><b>收文要分开判，因为它的属主不是人。</b>分页按调用方的部门收，按 id 读连部门都不判。本面的判据是
 * 「这一行的收文部门 = 调用方所在部门」；部门读不出来时**收窄**（交回 {@code null}），而不是放过——
 * 与 {@link YudaoAdministrator} 同一条理由：读不出来就窄。
 *
 * <p><b>状态回写这条写，在工具路径上拒绝。</b>{@code updateXxxStatus} 的调用方是流程监听器
 * （如 {@code OaLeaveApplyStatusListener}）；工具路径上出现它，只可能是有人给 AI 开了一条「自己批自己」的路。
 * 故它不是收窄，是**拒绝**——被拒正是落进审计的那一条。
 *
 * <p><b>这是一处声明的收窄，比模块更严、不等于模块。</b>模块允许审批人看别人的单据——那正是流程引擎的用途。
 * 本面只问「这一行是不是调用方的」，要放宽到审批，是对**这个宿主词表**的决定，此处留而未决。
 *
 * <p><b>只在工具路径上工作。</b>{@code ActingCaller} 非空才是工具：没有请求、没有登录用户、模块自己的
 * {@code @PreAuthorize} 一条都不跑。请求路径上它为空，本通知原样放行，控制台的行为与上游一致。
 *
 * <p>English: the OA module's seam over the <b>application-document family</b> — M3 batch three's only
 * gap, one sentence shared by fourteen services.
 *
 * <p><b>What those fourteen objects look like, read out of the module's own code.</b> (1) The owner is
 * {@code creator} for most (no business column on the row), a real {@code user_id} column for seal /
 * vehicle apply / vehicle return, and — the exception — {@code dept_id} for the received official
 * document: the owner is a department, not a person. (2) The page is <b>already</b> scoped: it takes the
 * caller as an argument and the mapper filters on it, so no page narrowing is needed here. (3) The read
 * by id is <b>not</b> checked: all fourteen are a bare {@code selectById}. That is the one hole. (4)
 * Draft edits already check the creator; {@code updateXxxStatus} is called by the BPM process listener,
 * not by a person and not by a tool.
 *
 * <p><b>Why read-by-identifier rather than the page.</b> The page is already narrowed at the module, so
 * narrowing it again is repetition; the read by id is the call with no check. The posture is the third
 * form in §2.1: the caller names a row by an identifier it knows, and another's row answers exactly as
 * a missing one ({@code null}). <b>It is falsifiable</b>: with one row per caller plus a missing
 * identifier, asking for B's row and for the missing one must be observably identical, while asking for
 * one's own returns one's own business fact; without the seam the first returns B's row.
 *
 * <p><b>The received document is judged separately, because its owner is not a person.</b> Its page is
 * scoped by the caller's department and its read by id checks nothing at all. This advice asks "is this
 * row's receiving department the caller's department", and an unreadable department <b>narrows</b>
 * rather than passes — the same rule as {@link YudaoAdministrator}.
 *
 * <p><b>The status write is refused on the tool path.</b> {@code updateXxxStatus} belongs to the process
 * listener; on the tool path it could only mean someone gave the AI a way to approve its own request.
 * That is a refusal, not a narrowing — and the refusal is what lands in the audit.
 *
 * <p><b>A declared narrowing: stricter than the module, not equal to it.</b> The module lets an approver
 * read another's document; this advice asks only "is this the caller's row". Widening it to approvals is
 * a decision about this host's vocabulary, left unmade.
 *
 * <p><b>Tool path only.</b> A non-null {@code ActingCaller} means a tool made the call, where none of the
 * module's {@code @PreAuthorize} runs. On the request path it is null and this advice passes through
 * untouched, so the console behaves exactly as upstream.
 */
@Aspect
@Component
public class OaApplyDocumentsGovernance implements GovernedModule {

    /** 声明本模块受治理，使集合可数——见 {@link GovernedModuleRegistry}。
     *  Declares this module governed, so the set is countable — see {@link GovernedModuleRegistry}. */
    @Override
    public String module() {
        return "oa";
    }

    /**
     * 十四件里十件的属主列是 {@code creator}；另外四种形状（{@code user_id} ×3 与 {@code dept_id} ×1）在
     * {@link #ownerOf(Object)} 与 {@link #withholdOthersRow} 里逐个点名——一个字段名装不下四种形状，
     * 而假装装得下正是一句会漂的声明。
     *
     * Ten of the fourteen carry {@code creator}; the other shapes ({@code user_id} ×3 and {@code dept_id}
     * ×1) are named one by one in {@link #ownerOf(Object)}. One field name cannot hold four shapes, and
     * pretending it can is exactly the declaration that drifts.
     */
    @Override
    public String ownerField() {
        return "creator";
    }

    private final YudaoModuleScope scope;
    private final AdminUserApi adminUsers;

    public OaApplyDocumentsGovernance(YudaoModuleScope scope, AdminUserApi adminUsers) {
        this.scope = scope;
        this.adminUsers = adminUsers;
    }

    /**
     * 按 id 读：不是调用方的行，交回的与「这一行不存在」是同一个答案。
     *
     * <p>点切逐条点名，而不是用通配——清单就是这份活的本身：哪一句被管住，读这个注解即可。
     *
     * A read by id: another's row answers exactly as a missing one.
     *
     * <p>The pointcuts name each service one by one instead of wildcarding: the list <em>is</em> the
     * reading, and which call is held is legible from this annotation alone.
     */
    @Around("execution(* cn.iocoder.yudao.module.oa.service.leave.OaLeaveApplyService.getLeaveApply(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.overtime.OaOvertimeApplyService.getOvertimeApply(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.reimbursement.OaReimbursementService.getReimbursement(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.regular.OaRegularApplyService.getRegularApply(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.resign.OaResignApplyService.getResignApply(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.travel.OaTravelApplyService.getTravelApply(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.travel.OaTravelReimbursementService.getTravelReimbursement(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.supply.OaSupplyApplyService.getSupplyApply(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.seal.OaSealApplyService.getSealApply(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.vehicle.OaVehicleApplyService.getVehicleApply(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.vehicle.OaVehicleReturnService.getVehicleReturn(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.meetingroom.OaMeetingRoomBookingService.getMeetingRoomBooking(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.officialdoc.OaOfficialDocSendService.getOfficialDocSend(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.officialdoc.OaOfficialDocReceiveService.getOfficialDocReceive(..))")
    public Object withholdOthersRow(ProceedingJoinPoint call) throws Throwable {
        Object row = call.proceed();
        Long caller = scope.callerToEnforce();
        if (caller == null || row == null) {
            return row;
        }
        // 收文的属主是部门，不是人；判据不同，故先于其余分支。
        // The received document's owner is a department, not a person; judged before the other branches.
        if (row instanceof OaOfficialDocReceiveDO receive) {
            Long dept = callerDept(caller);
            return dept != null && dept.equals(receive.getReceiveDeptId()) ? row : null;
        }
        String owner = ownerOf(row);
        return owner != null && scope.belongsToCaller(owner, caller) ? row : null;
    }

    /**
     * 状态回写：工具路径上一律拒绝。调用它的应当是流程监听器，那里 {@code ActingCaller} 为空。
     *
     * The status write: refused on the tool path. Its caller should be the process listener, where
     * {@code ActingCaller} is empty.
     */
    @Around("execution(* cn.iocoder.yudao.module.oa.service.leave.OaLeaveApplyService.updateLeaveApplyStatus(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.overtime.OaOvertimeApplyService.updateOvertimeApplyStatus(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.reimbursement.OaReimbursementService.updateReimbursementStatus(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.regular.OaRegularApplyService.updateRegularApplyStatus(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.resign.OaResignApplyService.updateResignApplyStatus(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.travel.OaTravelApplyService.updateTravelApplyStatus(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.travel.OaTravelReimbursementService.updateTravelReimbursementStatus(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.supply.OaSupplyApplyService.updateSupplyApplyStatus(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.seal.OaSealApplyService.updateSealApplyStatus(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.vehicle.OaVehicleApplyService.updateVehicleApplyStatus(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.vehicle.OaVehicleReturnService.updateVehicleReturnStatus(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.meetingroom.OaMeetingRoomBookingService.updateMeetingRoomBookingStatus(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.officialdoc.OaOfficialDocSendService.updateOfficialDocSendStatus(..))"
            + " || execution(* cn.iocoder.yudao.module.oa.service.officialdoc.OaOfficialDocReceiveService.updateOfficialDocReceiveStatus(..))")
    public Object refuseStatusWrite(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.creatingCaller();
        if (caller != null) {
            throw new RuleDeniedException(null, "申请单据的审批状态由流程监听器回写，工具面不提供这条写",
                    "OaApplyDocument", "updateStatus",
                    "审批请走流程任务面；这里不接受对单据状态的回写");
        }
        return call.proceed();
    }

    /**
     * 一行属于谁，作为字符串。三种形状在这里被逐个点名；认不出的行返回 {@code null}，而调用方把
     * {@code null} 当作「不是你的」——认不出就窄，与读不出就窄同一条规则。
     *
     * Whose row this is, as a string. The three shapes are named one by one; an unclassifiable row
     * returns {@code null}, which the caller treats as "not yours" — unclassifiable narrows, the same
     * rule as unreadable.
     */
    private static String ownerOf(Object row) {
        if (row instanceof OaSealApplyDO seal) {
            return id(seal.getUserId());
        }
        if (row instanceof OaVehicleApplyDO vehicle) {
            return id(vehicle.getUserId());
        }
        if (row instanceof OaVehicleReturnDO returning) {
            return id(returning.getUserId());
        }
        if (row instanceof BaseDO base) {
            return base.getCreator();
        }
        return null;
    }

    /**
     * 调用方所在的部门。读不出来返回 {@code null}，调用方据此收窄。
     *
     * The department the caller sits in; {@code null} when it cannot be read, and the caller narrows
     * on that.
     */
    private Long callerDept(Long caller) {
        try {
            AdminUserRespDTO user = TenantUtils.execute(YudaoCallerTenant.current(),
                    () -> adminUsers.getUser(caller));
            return user == null ? null : user.getDeptId();
        } catch (RuntimeException unreadable) {
            return null;
        }
    }

    private static String id(Long value) {
        return value == null ? null : String.valueOf(value);
    }
}
