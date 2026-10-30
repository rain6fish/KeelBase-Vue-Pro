// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.effect.SideEffect;
import cn.com.keelbase.runtime.effect.SideEffectCompensator;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.infra.controller.admin.demo.demo01.vo.Demo01ContactSaveReqVO;
import cn.iocoder.yudao.module.infra.dal.dataobject.demo.demo01.Demo01ContactDO;
import cn.iocoder.yudao.module.infra.dal.mysql.demo.demo01.Demo01ContactMapper;
import cn.iocoder.yudao.module.infra.service.demo.demo01.Demo01ContactService;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.context.annotation.Bean;
import org.springframework.stereotype.Component;

/**
 * Governance for the infra module's demo contact — the third module delivered against the recipe and
 * the first one that is neither CRM nor FMS. It exists to answer a different question from the five
 * before it: what does a module whose rows carry no owner column at all cost?
 *
 * <p><b>The owner is the audit string, and the module never filters on it.</b> {@code
 * yudao_demo01_contact} has no dedicated owner column; MyBatis-Plus fills {@code creator} from the
 * logged-in user. Its page VO takes a name, a sex and a created-time range, and nothing that names a
 * caller. So the advice cannot pass a filter down the way FMS passes {@code creatorUserId}; it lets the
 * module answer and then keeps only the caller's rows. That is a declared narrowing and it is narrower
 * than a count-preserving filter: the page total is recomputed from the rows this page returned, so a
 * caller with more rows than one page sees a total that describes the page, not the table.
 *
 * <p><b>Read by id and update by id get the same answer as "not there".</b> A row outside the caller's
 * scope is withheld from a read and refused on a write, and the refusal carries the same reason the
 * other modules use. The create path is not advised: the module's own insert is stamped by the
 * framework's audit field handler, and there is no field on the save VO for the advice to set.
 *
 * infra 模块示例联系人的治理——照 recipe 交付的第三个模块，也是第一个既非 CRM、也非 FMS 的模块。它要回答
 * 的问题与前面五个不同：**一个行上根本没有属主列的模块，代价是多少？**
 *
 * <p><b>属主就是审计串，而模块自己从不按它筛。</b>`yudao_demo01_contact` 没有专设的属主列；`creator` 由
 * MyBatis-Plus 从登录用户填。它的分页 VO 收名字、性别与创建时间区间，没有任何一项能指认调用方。故本通知
 * **不能**像 FMS 那样把 `creatorUserId` 筛选项传下去；它让模块先答，再只留调用方自己的行。那是一处**声明的
 * 收窄**，而且比「保住总量的筛选」更窄：页总量由本页留下的行重算，故一页装不下时，调用方看到的总量描述的是
 * **这一页**、不是整张表。
 *
 * <p><b>按 id 读与按 id 改给出同一个「不存在」的答案。</b>范围之外的行，读被扣下、写被拒绝，拒绝带的是与
 * 其它模块同一条理由。创建那条路**没有**通知：模块自己的 insert 由框架的审计字段处理器盖章，而保存 VO 上
 * 没有任何字段可供通知去写。
 */
@Aspect
@Component
public class Demo01ContactGovernance implements GovernedModule {

    private final YudaoModuleScope scope;
    private final Demo01ContactMapper mapper;

    public Demo01ContactGovernance(YudaoModuleScope scope, Demo01ContactMapper mapper) {
        this.scope = scope;
        this.mapper = mapper;
    }

    /**
     * 本模块的补偿器：**建**的就删、**改名**的拒（`YD-44`）。**它随模块走** —— 不再往宿主的
     * `YudaoLocalCompensators` 里追加 bean，故新模块的宿主级件是 0 行。
     *
     * The module's own compensator: a create is deleted, a rename is refused (`YD-44`). It travels with the module —
     * nothing is appended to the host's `YudaoLocalCompensators`, so a new module's host-level artefacts are zero
     * lines.
     */
    @Bean
    SideEffectCompensator demo01ContactCompensator(Demo01ContactService service) {
        return new Demo01ContactCompensator(service);
    }

    /** The segment the pointcuts below name. / 下面那些切点所指的那一段。 */
    @Override
    public String module() {
        return "infra";
    }

    /** The audit column this module already has. / 本模块本来就有的那根审计列。 */
    @Override
    public String ownerField() {
        return "creator";
    }

    /**
     * The page, narrowed after the module has answered. A caller the scope machine exempts is left
     * alone; everyone else keeps only rows whose {@code creator} is their own id.
     *
     * 分页在模块答完之后收窄。范围机器豁免的调用方不动；其余人只留 `creator` 等于自己 id 的行。
     */
    @Around("execution(* cn.iocoder.yudao.module.infra.service.demo.demo01.Demo01ContactService.getDemo01ContactPage(..))")
    @SuppressWarnings("unchecked")
    public Object narrowToCaller(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object outcome = call.proceed();
        if (caller == null || !(outcome instanceof PageResult<?> page)) {
            return outcome;
        }
        List<Demo01ContactDO> mine = ((PageResult<Demo01ContactDO>) page).getList().stream()
                .filter(row -> scope.belongsToCaller(row.getCreator(), caller))
                .toList();
        return new PageResult<>(mine, (long) mine.size());
    }

    /**
     * A read by id is a bare {@code selectById}; another's row is handed back as nothing — the same
     * answer a row that is not there gives.
     *
     * 按 id 读是一句裸 `selectById`；别人的行**什么都不交回**——与不存在的那一行给出同一个答案。
     */
    @Around("execution(* cn.iocoder.yudao.module.infra.service.demo.demo01.Demo01ContactService.getDemo01Contact(..))")
    public Object withholdOthersRow(ProceedingJoinPoint call) throws Throwable {
        Object row = call.proceed();
        Long caller = scope.callerToEnforce();
        if (caller != null && row instanceof Demo01ContactDO found
                && !scope.belongsToCaller(found.getCreator(), caller)) {
            return null;
        }
        return row;
    }

    /**
     * The create is stamped with the acting caller, because the framework's audit-field handler reads
     * the security context and the AI tool path publishes its caller through {@code ActingCaller}
     * instead. Without this, a row the tool creates lands with an empty {@code creator} and is invisible
     * to its own owner. The module's save VO has no creator field, so the stamp is written by id after
     * the insert — inside the same governed call, hence inside the same tenant context.
     *
     * 创建由**正在行动的调用方**盖章：框架的审计字段处理器读的是安全上下文，而 AI 工具那条路把调用方发布在
     * `ActingCaller` 里。不补这一下，工具建的行会带着空 `creator` 落库、对它自己的属主不可见。模块的保存 VO
     * 没有 creator 字段，故盖章是在 insert 之后按 id 写回——在同一次受治理调用里，也就是同一个租户上下文里。
     */
    @Around("execution(* cn.iocoder.yudao.module.infra.service.demo.demo01.Demo01ContactService.createDemo01Contact(..))")
    public Object stampCreator(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.creatingCaller();
        Object outcome = call.proceed();
        if (caller != null && outcome instanceof Long id) {
            Demo01ContactDO stamp = new Demo01ContactDO();
            stamp.setId(id);
            stamp.setCreator(String.valueOf(caller));
            mapper.updateById(stamp);
        }
        return outcome;
    }

    /**
     * An update by id has to be the caller's row, or it is refused. The module's own update checks only
     * that the row exists, so the ownership question is answered here, before the write runs.
     *
     * 按 id 改必须是调用方自己的行，否则**拒绝**。模块自己的更新只查那一行在不在，故归属问题在这里、
     * 在写跑起来之前回答。
     */
    @Around("execution(* cn.iocoder.yudao.module.infra.service.demo.demo01.Demo01ContactService.updateDemo01Contact(..))")
    public Object requireOwnership(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object[] args = call.getArgs();
        if (caller != null && args.length >= 1
                && args[0] instanceof Demo01ContactSaveReqVO request && request.getId() != null) {
            Demo01ContactDO existing = mapper.selectById(request.getId());
            scope.requireOwned(existing == null ? null : existing.getCreator(),
                    caller, "Demo01Contact", "update");
        }
        return call.proceed();
    }

    /**
     * {@code infra_demo01_contact}: a create is deleted; a rename is refused. The face's two writes share
     * one result type, and the create prefix is what tells them apart — a rename records no earlier
     * shape, so undoing it would be a guess.
     *
     * {@code infra_demo01_contact}：**建**的就删，**改名**的拒。本面的两笔写共用一个结果类型，而 `create_`
     * 前缀正是区分它们的地方——改名没有留下早先的样子，撤销它只能是猜。
     *
     * <p>**它随模块走（`YD-44`）**：原先住在宿主的 `YudaoLocalCompensators` 里。
     *
     * <p><b>It travels with the module (`YD-44`)</b>: it used to live in the host's `YudaoLocalCompensators`.
     */
    static final class Demo01ContactCompensator implements SideEffectCompensator {

        private final Demo01ContactService service;

        Demo01ContactCompensator(Demo01ContactService service) {
            this.service = service;
        }

        @Override
        public String resultType() {
            return "infra_demo01_contact";
        }

        @Override
        public void compensate(SideEffect effect) {
            YudaoLocalCompensators.requireCreate(effect);
            YudaoLocalCompensators.as(effect, () -> service.deleteDemo01Contact(effect.getResultId()));
        }
    }
}
