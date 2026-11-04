// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.iocoder.yudao.module.crm.controller.admin.followup.vo.CrmFollowUpRecordSaveReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.followup.CrmFollowUpRecordDO;
import cn.iocoder.yudao.module.crm.dal.dataobject.permission.CrmPermissionDO;
import cn.iocoder.yudao.module.crm.enums.permission.CrmPermissionLevelEnum;
import cn.iocoder.yudao.module.crm.service.permission.CrmPermissionService;
import java.util.ArrayList;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * 跟进记录（`crm_follow_up_record`）在模块接缝上的治理——M3 里**属主不在这一行上**、且**分页只有一个业务行过滤位**的对象。
 *
 * <p><b>四问的答案，逐条读自模块自己的代码。</b>
 *
 * <ol>
 *   <li><b>属主是谁。</b>{@code CrmFollowUpRecordDO} 只有 {@code biz_type} + {@code biz_id} 这一对多态外键：跟进记录挂在
 *       客户 / 商机 / 线索 / 联系人 / 合同下面（{@code CrmFollowUpRecordServiceImpl#createFollowUpRecord} 只更新这五类）。
 *       模块自己的 {@code @CrmPermission(bizTypeValue = "#createReqVO.bizType", bizId = "#createReqVO.bizId", …)}
 *       问的正是**业务行**的权限行，故属主在这一跳之外：按 {@code (bizType, bizId)} 读 {@code crm_permission}。</li>
 *   <li><b>分页无过滤返回什么。</b>{@code getFollowUpRecordPage(pageReqVO)} 交给
 *       {@code crmFollowUpRecordMapper.selectPage}，条件只有 {@code bizType} / {@code bizId}（{@code CrmFollowUpRecordPageReqVO}
 *       的两列，都可为空）。两列都不给就是本租户整张表——而这两列**不是属主位**：它们指向的那一行才决定谁能读。</li>
 *   <li><b>按 id 读是否收窄。</b>不收窄。{@code getFollowUpRecord(Long id)} 是裸的 {@code selectById}；控制器
 *       {@code CrmFollowUpRecordController#getFollowUpRecord} 事后拿 {@code getLoginUserId()} 判 READ，但 AI 路径没有
 *       登录用户，那条判据不经过。</li>
 *   <li><b>写查什么权限。</b>{@code createFollowUpRecord} 声明 WRITE（业务行），{@code deleteFollowUpRecord} 在方法体里
 *       显式拿传入的 {@code userId} 判 OWNER——后者不依赖登录用户，故 AI 路径上它自己就管得住，本切面不重复。
 *       {@code createFollowUpRecordBatch} 是内部批写（线索转换等），没有「只改调用方自己那一行」的语义，也不在切点里。</li>
 * </ol>
 *
 * <p><b>接法：读按标识符 + 事后沿 {@code (bizType, bizId)} 判属主；分页在工具路径上拒绝。</b>调用方以它知道的记录编号
 * 点名一行；本通知读回该行的业务行权限行，读不到的与不存在的那一行**交回同一个答案**（{@code null}）。规则照抄模块
 * 自己的 READ 口径：没有权限行的业务行（公海）、有行却没有负责人（孤儿）都算可读，其余要求调用方在表里**有自己的一行**
 * （负责人 / 读写 / 只读都算）。分页只有业务行过滤位、没有属主位，故在工具路径上**不开**——不是事后删行，是不声明它。
 *
 * <p><b>声明的收窄。</b>模块的 {@code CrmPermissionAspect} 还会沿下级展开（{@code adminUserApi.getUserListBySubordinate}），
 * 并对 CRM 超级管理员直接放行；本切面**不做这两件事**——沿下级展开要用户管理面的人事关系，属于另一个决定；超级管理员的
 * 豁免在这里也不复制，故工具面**比控制台更窄**。这处更窄是写明的，不是漏掉的。
 *
 * <p><b>为什么只在工具路径上工作。</b>{@link ActingCaller#current()} 非空说明调用来自工具：没有请求、没有登录用户，模块
 * 自己的权限注解一条都不经过。请求路径上它为空，本通知**原样放行**，控制台的行为与上游一致。
 *
 * <p>The governance of follow-up records ({@code crm_follow_up_record}) at the module's own seam — the M3 object whose
 * **owner is not on the row**, and whose page carries only a business-row filter.
 *
 * <p><b>The four answers, read out of the module's own code.</b> (1) The DO carries only the polymorphic pair
 * {@code biz_type} + {@code biz_id}: a record hangs under a customer, business, clue, contact or contract (exactly the
 * five the service updates). The module's own {@code @CrmPermission} annotation asks the **business row's** permission
 * rows, so the owner is one hop away. (2) The page filters on {@code bizType} / {@code bizId} alone, both nullable —
 * neither is an owner slot; the row they name is what decides. (3) The read by id is a bare {@code selectById}; the
 * controller checks READ afterwards with the login user, and an AI call has none. (4) Create asks WRITE on the business
 * row; delete checks OWNER inline with the passed user id, which holds on the AI path already and is not repeated here.
 * The batch create is an internal write and stays out.
 *
 * <p><b>The form.</b> Read by identifier, then decide the owner along {@code (bizType, bizId)}: the caller names a record
 * id, the advice reads the business row's permission rows and hands back {@code null} for a record it cannot attribute —
 * the same answer as a record that is not there. The READ rule is copied from the module: a business row with no
 * permission rows (public sea) or with no owner row (orphaned) is readable; otherwise the caller needs a row of its own.
 * The page has no owner slot, so it is **not offered** on the tool path.
 *
 * <p><b>A declared narrowing.</b> The module's aspect also expands to subordinates and exempts CRM super administrators;
 * this advice does neither, so the tool face is **narrower than the console**. That is stated, not forgotten.
 *
 * <p><b>Why only on the tool path.</b> A non-null {@link ActingCaller#current()} means a tool made the call: no request,
 * no login user, and none of the module's permission annotations runs. On the request path it is null and the call passes
 * through, so the console behaves exactly as upstream.
 */
@Aspect
@Component
public class CrmFollowUpRecordGovernance implements GovernedModule {

    private final CrmPermissionService permissions;

    public CrmFollowUpRecordGovernance(CrmPermissionService permissions) {
        this.permissions = permissions;
    }

    /** Declares this module governed, so the set is countable — see {@link GovernedModuleRegistry}. */
    @Override
    public String module() {
        return "crm";
    }

    /**
     * 读者能据此查表的列：跟进记录行没有属主列，属主在 {@code biz_id} 指向的那一行（连同 {@code biz_type}）。
     *
     * The row column a reader can look up: the record has no owner column; the owner lives on the row
     * {@code biz_id} names (together with {@code biz_type}).
     */
    @Override
    public String ownerField() {
        return "biz_id";
    }

    /**
     * 按 id 读：把该行的业务行权限读回来。别人的记录——包括业务行已不存在、判不出属主的那些——**什么都不交回**。
     *
     * A read by id: the business row's permission rows are read back. Another person's record — including one whose
     * business row is gone and can no longer be attributed — comes back as nothing.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.followup.CrmFollowUpRecordService.getFollowUpRecord(..))")
    public Object withholdOthersRecord(ProceedingJoinPoint call) throws Throwable {
        Long caller = actingCaller(call);
        Object row = call.proceed();
        if (caller == null || !(row instanceof CrmFollowUpRecordDO record)) {
            return row;
        }
        return readable(record.getBizType(), record.getBizId(), caller) ? row : null;
    }

    /**
     * 分页只有业务行过滤位、没有属主位，故在工具路径上**拒绝**而不是作答（事后删行改的是答案的结构）。请求路径一字不动。
     *
     * The page carries a business-row filter and no owner slot, so it is refused on the tool path rather than answered
     * (post-filtering changes the shape of the answer). The request path is untouched.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.followup.CrmFollowUpRecordService.getFollowUpRecordPage(..))")
    public Object refuseThePageOnTheToolPath(ProceedingJoinPoint call) throws Throwable {
        Long caller = actingCaller(call);
        if (caller == null) {
            return call.proceed();
        }
        throw new RuleDeniedException(null,
                "not permitted: the follow-up-record page is not on the tool face",
                "CrmFollowUpRecord", call.getSignature().getName(),
                "请改用跟进记录编号查一条；分页的过滤位是业务行本身，不是属主");
    }

    /**
     * 按业务行批量读：逐行判，留不下的记录**不出现在**结果里——「这个业务行没有跟进」与「这个业务行不是你的」同形。
     *
     * The bulk read by business row: decided row by row, so a record that cannot be attributed is **absent** — "this
     * business row has no follow-ups" and "this business row is not yours" share one shape.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.followup.CrmFollowUpRecordService.getFollowUpRecordByBiz(..))")
    public Object withholdOtherBizRecords(ProceedingJoinPoint call) throws Throwable {
        Object rows = call.proceed();
        Long caller = actingCaller(call);
        if (caller == null || !(rows instanceof List<?> all)) {
            return rows;
        }
        List<CrmFollowUpRecordDO> kept = new ArrayList<>();
        for (Object item : all) {
            if (item instanceof CrmFollowUpRecordDO record
                    && readable(record.getBizType(), record.getBizId(), caller)) {
                kept.add(record);
            }
        }
        return kept;
    }

    /**
     * 创建：模块声明的是业务行的 WRITE，而 AI 路径上那条注解不经过。这里补上同一档——负责人与读写可写，只读与公海不可写。
     *
     * Create: the module asks WRITE on the business row, and that annotation does not run on the AI path. The same tier
     * is restored here — owner and write may create, read-only and public-sea may not.
     */
    @Around("execution(* cn.iocoder.yudao.module.crm.service.followup.CrmFollowUpRecordService.createFollowUpRecord(..))")
    public Object requireWriteOnTheBiz(ProceedingJoinPoint call) throws Throwable {
        Long caller = actingCaller(call);
        if (caller != null && call.getArgs().length >= 1
                && call.getArgs()[0] instanceof CrmFollowUpRecordSaveReqVO record
                && !writable(record.getBizType(), record.getBizId(), caller)) {
            throw new RuleDeniedException(null,
                    "not permitted: the business row behind this follow-up is not writable by the caller",
                    "CrmFollowUpRecord", call.getSignature().getName(),
                    "跟进记录挂在业务行下；请确认你在该行有写权限，或让该行的负责人操作");
        }
        return call.proceed();
    }

    /**
     * 读的口径照抄模块：没有权限行（公海）、有行却没有负责人（孤儿）都可读；其余要求调用方在表里有自己的一行。
     *
     * The module's own READ rule: no permission rows (public sea) and rows without an owner (orphaned) are readable;
     * otherwise the caller needs a row of its own.
     */
    private boolean readable(Integer bizType, Long bizId, Long caller) {
        if (bizType == null || bizId == null) {
            return false;
        }
        List<CrmPermissionDO> rows = permissions.getPermissionListByBiz(bizType, bizId);
        if (rows.isEmpty()) {
            return true;
        }
        boolean hasOwner = rows.stream()
                .anyMatch(row -> CrmPermissionLevelEnum.OWNER.getLevel().equals(row.getLevel()));
        if (!hasOwner) {
            return true;
        }
        return rows.stream().anyMatch(row -> caller.equals(row.getUserId()));
    }

    /**
     * 写的口径照抄模块：负责人与读写可写；没有权限行、没有负责人、只有只读一律不可写。
     *
     * The module's own WRITE rule: owner and write may write; no rows, no owner, or read-only may not.
     */
    private boolean writable(Integer bizType, Long bizId, Long caller) {
        if (bizType == null || bizId == null) {
            return false;
        }
        return permissions.getPermissionListByBiz(bizType, bizId).stream()
                .anyMatch(row -> caller.equals(row.getUserId())
                        && (CrmPermissionLevelEnum.OWNER.getLevel().equals(row.getLevel())
                        || CrmPermissionLevelEnum.WRITE.getLevel().equals(row.getLevel())));
    }

    /**
     * 行动调用方的本地用户编号；**没有**行动调用方（即请求路径）时为 {@code null}。有行动调用方却指不出本地编号时
     * **拒绝**而不是放行——读不出来的判据不会变成许可，与其它模块面同一条纪律。
     *
     * The acting caller as a local user id, or {@code null} when there is none — the request path. An acting caller that
     * is not a local user id is refused rather than passed through: a check that cannot be read does not become
     * permission, the same discipline the other module faces keep.
     */
    private static Long actingCaller(ProceedingJoinPoint call) {
        String caller = ActingCaller.current();
        if (caller == null) {
            return null;
        }
        try {
            return Long.valueOf(caller);
        } catch (NumberFormatException notAnId) {
            throw new RuleDeniedException(null,
                    "not permitted: the acting caller is not a local user id",
                    "CrmFollowUpRecord", call.getSignature().getName(),
                    "该读要求一个本宿主的用户编号；请让持有该身份的调用方重试");
        }
    }
}
