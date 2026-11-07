// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.com.keelbase.runtime.identity.ActingCaller;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * pms 在项目、工作项与迭代上的接缝——本线的**第三种形态**：可见性由 service 自己判，接缝只决定「它问的是谁」。
 *
 * <p><b>四问的答案，逐条读自模块自己的代码。</b>
 *
 * <ol>
 *   <li><b>属主是谁。</b>项目**没有属主列**：`PmsProjectDO` 上没有 owner/leader 字段，可见性由
 *       `pms_project_member` 这张成员表回答；工作项有一个 `assigneeUserId`，但读权限仍然经项目成员。
 *       `PmsProjectMemberServiceImpl.validateProjectReadable` 写得很清楚——公开项目人人可读，私有项目要成员或超管。</li>
 *   <li><b>分页怎么收。</b>`getProjectPage(vo, Long userId)` 与 `getWorkItemPage(vo, Long userId)` 都把调用方**当实参**
 *       收进来，再按成员关系收窄；工作项那条还会先 `validateProjectReadable(projectId, userId)`。
 *       迭代那两条（`getIterationPage(vo, userId)` / `getUncompletedIterationPage(vo, userId)`）同样把调用方当实参收进来，
 *       mapper 侧按成员项目收窄。</li>
 *   <li><b>按 id 读是否收窄。</b>收窄——`getProjectAndUpdateVisitTime(id, userId)` 与
 *       `getWorkItem(id, userId)` / `getWritableWorkItem(id, userId)` 都以 userId 判定成员关系。
 *       工时那两条（`getWorkItemWorkLogSummary(workItemId, userId)` / `getWorkItemWorkLog(id, userId)`）同样先把
 *       userId 交给 `getWorkItem(workItemId, userId)`——可见性仍是一句话：能不能读这个项目。
 *       迭代那两条（`getIteration(id, userId)` / `getIterationOverview(id, userId)`）经
 *       `projectMemberService.validateProjectReadable(iteration.getProjectId(), userId)` 判定；概览内部再调
 *       `getIteration(id, userId)`，故统计与单行读同一条判据。
 *       （`PmsProjectService.getProject(Long)` 是一句裸读，但控制台不用它，本面也不接它。）</li>
 *   <li><b>写查什么权限。</b>`pms:pm:project:*`、`pms:pm:work-item:*` 与 `pms:pm:iteration:*`；写口不在本面（本面只读）。</li>
 * </ol>
 *
 * <p><b>接缝只做一件事：把最后一个实参换成正在行动的人。</b>模块自己已经把可见性判好了，缺的只是「那个实参由谁决定」。
 * 工具路径上它是模型填得出的，故本通知把它钉成 {@code ActingCaller.current()}；请求路径上 `ActingCaller` 为空，
 * controller 已经点名了登录用户，**原样放行**。
 *
 * <p><b>这是一条声明的收窄。</b>控制台里一个有权 `pms:pm:project:query` 的人能按任意 userId 参数查询（那正是
 * 「帮同事看看」的运营用法）；工具面只答**调用方自己**的项目与工作项。两者不是同一个问题，故这里更严、且更窄。
 *
 * <p><b>为什么不点切 `getProject(Long)`。</b>它不收窄，而本面没有任何工具调它；把它留在射程外，并在清单里点名。
 * 将来若加一条工具用它，那条工具不许走这个口，点切与本清单必须一起长。
 *
 * pms's seam over projects, work items and iterations — this line's **third form**: the service already decides
 * visibility, and the seam only decides *who is being asked about*.
 *
 * <p><b>The four answers, read out of the module's own code.</b> (1) A project has **no owner column**; visibility
 * is answered by the `pms_project_member` table, and a work item's read is still gated by project membership
 * (`validateProjectReadable`: an open project is readable by anyone, a private one needs membership or the super
 * administrator). (2) Both pages take the caller **as an argument** and narrow by membership; the two iteration pages
 * (`getIterationPage(vo, userId)` / `getUncompletedIterationPage(vo, userId)`) do the same in the mapper. (3) The reads
 * by id narrow the same way; the two work-log reads hand their user id to `getWorkItem(workItemId, userId)` first, and
 * the two iteration reads (`getIteration(id, userId)` / `getIterationOverview(id, userId)`) go through
 * `projectMemberService.validateProjectReadable(iteration.getProjectId(), userId)` — the overview calls
 * `getIteration(id, userId)` itself, so the statistics and the single-row read share one sentence. (4) Writes sit
 * behind `pms:pm:project:*` / `pms:pm:work-item:*` / `pms:pm:iteration:*`, and this face is read-only.
 *
 * <p><b>The seam does exactly one thing: the last argument becomes the person acting.</b> The module already judges
 * visibility; what is missing is who decides that argument. On the tool path a model can fill it, so this advice pins
 * it to {@code ActingCaller.current()}; on the request path `ActingCaller` is empty and the controller has already
 * named the login user, so the call passes through untouched.
 *
 * <p><b>A declared narrowing.</b> A console user holding `pms:pm:project:query` may query with any {@code userId} —
 * that is the "look at it for a colleague" usage. The tool face answers only the caller's own projects and work items.
 * Different questions; this face is stricter and narrower, and says so.
 *
 * <p><b>Why {@code getProject(Long)} is not in the pointcut.</b> It does not narrow, and no tool here calls it. If one
 * is added later it must not use that port, and the pointcut and this sentence grow together.
 */
@Aspect
@Component
public class PmsProjectGovernance implements GovernedModule {

    /**
     * 本类治理的模块，按构建的叫法。 / The module this class governs, as the build names it.
     */
    @Override
    public String module() {
        return "pms";
    }

    /**
     * 项目没有属主列：一行归谁看，由**成员表**回答，不是某一列的值。 / No owner column: a row's audience is
     * answered by a **membership table**, not by a column's value.
     */
    @Override
    public String ownerField() {
        return "none (the row's audience is a membership table, not a column)";
    }

    /**
     * 把最后一个实参钉成行动调用方——十二条读口都以 userId 收尾。
     *
     * 请求路径（没有行动调用方）原样放行；有行动调用方却指不出本地用户编号时**拒绝**，与 FMS 那两条同一纪律。
     *
     * Pins the last argument to the acting caller — every one of the twelve reads ends with the user id. The request
     * path (no acting caller) passes through; a caller that cannot be read as a local user id is refused, the same
     * discipline as the two FMS seams.
     */
    @Around("execution(* cn.iocoder.yudao.module.pms.service.pm.project.PmsProjectService.getProjectPage(..))"
            + " || execution(* cn.iocoder.yudao.module.pms.service.pm.project.PmsProjectService.getProjectAndUpdateVisitTime(..))"
            + " || execution(* cn.iocoder.yudao.module.pms.service.pm.project.PmsProjectService.getProjectOverview(..))"
            + " || execution(* cn.iocoder.yudao.module.pms.service.pm.workitem.PmsWorkItemService.getWorkItemPage(..))"
            + " || execution(* cn.iocoder.yudao.module.pms.service.pm.workitem.PmsWorkItemService.getWorkItem(..))"
            + " || execution(* cn.iocoder.yudao.module.pms.service.pm.workitem.PmsWorkItemService.getWritableWorkItem(..))"
            + " || execution(* cn.iocoder.yudao.module.pms.service.pm.workitem.PmsWorkItemWorkLogService.getWorkItemWorkLogSummary(..))"
            + " || execution(* cn.iocoder.yudao.module.pms.service.pm.workitem.PmsWorkItemWorkLogService.getWorkItemWorkLog(..))"
            + " || execution(* cn.iocoder.yudao.module.pms.service.pm.iteration.PmsIterationService.getIteration(..))"
            + " || execution(* cn.iocoder.yudao.module.pms.service.pm.iteration.PmsIterationService.getIterationOverview(..))"
            + " || execution(* cn.iocoder.yudao.module.pms.service.pm.iteration.PmsIterationService.getIterationPage(..))"
            + " || execution(* cn.iocoder.yudao.module.pms.service.pm.iteration.PmsIterationService.getUncompletedIterationPage(..))")
    public Object pinTheUserIdArgument(ProceedingJoinPoint call) throws Throwable {
        String caller = ActingCaller.current();
        if (caller == null) {
            // 宿主自己的请求路径：controller 已经点名了登录用户。
            // The host's own request path: the controller has already named the login user.
            return call.proceed();
        }
        Long acting = asId(caller);
        if (acting == null) {
            // 有行动调用方却指不出本地编号 ⇒ 拒绝。读不出来的判据不会变成许可。
            // An acting caller whose id is not a local user is refused: a check that cannot be read is not permission.
            throw new RuleDeniedException(null,
                    "not permitted: the acting caller is not a local user id",
                    "PmsProject", call.getSignature().getName(),
                    "该读要求一个本宿主的用户编号；请让持有该身份的调用方重试");
        }
        Object[] args = call.getArgs();
        if (args.length == 0 || !(args[args.length - 1] instanceof Long)) {
            // 形状变了就放行而不是猜：猜一个实参的位置，比不做更坏。
            // A changed shape passes through rather than being guessed: guessing an argument's position is worse.
            return call.proceed();
        }
        Object[] pinned = args.clone();
        pinned[pinned.length - 1] = acting;
        return call.proceed(pinned);
    }

    private static Long asId(String value) {
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException notAnId) {
            return null;
        }
    }
}
