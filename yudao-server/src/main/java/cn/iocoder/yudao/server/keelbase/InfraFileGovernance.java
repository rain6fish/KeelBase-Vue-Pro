// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.RuleDeniedException;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.infra.controller.admin.file.vo.file.FilePageReqVO;
import cn.iocoder.yudao.module.infra.dal.dataobject.file.FileDO;
import cn.iocoder.yudao.module.infra.dal.mysql.file.FileMapper;
import cn.iocoder.yudao.module.infra.service.file.FileService;
import java.util.Collection;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * infra 文件在**模块自己的接缝上**受治理 —— 与 demo01 联系人同一形态：**没有属主列**。
 *
 * <p><b>四问的答案（读的是上游代码）。</b>
 *
 * <ol>
 *   <li><b>分页无过滤返回什么？</b>全部文件 —— `FilePageReqVO` 只有 `name`/`path` 的模糊条件，没有调用方维度。</li>
 *   <li><b>按 id 读是否收窄？</b>否 —— `getFile(Long)` 就是一句 `selectById`。</li>
 *   <li><b>保存 VO 能否指认别人？</b>没有属主字段：`FileCreateReqVO` 里没有「归谁」，行上的 `creator` 是**审计字段**，
 *       由持久层从登录上下文填。</li>
 *   <li><b>按 id 改写/删除是否查属主？</b>否。</li>
 * </ol>
 *
 * <p><b>于是收窄只能落在 `creator` 上，且分页只能「后过滤」。</b>本切面先把模块自己的分页拿到，再按调用方过滤，
 * 并**重算 `total = 保留下来的行数`** —— 这个 total 是**本页的**，不是全表的；`demo01` 的先例已把这一点写成规矩。
 * **写侧口径是本宿主的**（模块没有可对齐的权限表）：删除只认创建者，其余一律拒绝——注释写明，不假装是模块的口径。
 *
 * <p><b>创建这半不在切面里做。</b>`createFile(byte[], …)` 收二进制并返回**路径**（不是 id），而工具面不做上传
 * （见 `InfraFileTools` 的类注释）；故这里不设「按调用方盖章」的通知——没有工具路径会走到它，写了也只是没人执行的
 * 承诺。若日后开上传工具，盖章（回写 `creator`）必须与它**一起**加。
 *
 * <p>Infra files governed at the module's own seam — the same shape as demo01's contacts: **no owner column**.
 * The page has no caller dimension and a read by id is a bare `selectById`; the save VO has no owner field at all
 * (`creator` is the persistence layer's audit string). So the narrowing lands on `creator`, and the page can only be
 * filtered **after** the module answers — with `total` recomputed to the rows kept, which is this page's total and not
 * the table's (the demo01 precedent made that a rule). The write side is **this host's** rule, and says so: delete is
 * for the creator only. The create half is deliberately absent: `createFile(byte[], …)` returns a path rather than an
 * id and no tool uploads bytes (see {@link InfraFileTools}); a stamp nobody reaches would be a promise nobody keeps.
 */
@Aspect
@Component
public class InfraFileGovernance implements GovernedModule {

    private final YudaoModuleScope scope;
    private final FileMapper files;

    public InfraFileGovernance(YudaoModuleScope scope, FileMapper files) {
        this.scope = scope;
        this.files = files;
    }

    @Override
    public String module() {
        return "infra";
    }

    /** 审计字段不是属主列：本模块没有属主列，这里如实报 `creator`。 / `creator` is an audit field, not an owner column. */
    @Override
    public String ownerField() {
        return "creator";
    }

    /**
     * 分页：先让模块答，再按调用方过滤，并**重算 total = 本页保留的行数**（注释与类注释都声明了这一点）。
     *
     * The page: the module answers first, then the rows are filtered to the caller and `total` is recomputed to the rows
     * kept — this page's total, declared here and in the class comment.
     */
    @Around("execution(* cn.iocoder.yudao.module.infra.service.file.FileService.getFilePage(..))")
    public Object narrowToCaller(ProceedingJoinPoint call) throws Throwable {
        Object answer = call.proceed();
        Long caller = scope.callerToEnforce();
        if (caller == null || !(answer instanceof PageResult<?> page)) {
            return answer;
        }
        List<FileDO> kept = page.getList().stream()
                .filter((row) -> row instanceof FileDO file && belongsTo(file, caller))
                .map((row) -> (FileDO) row)
                .toList();
        return new PageResult<>(kept, (long) kept.size());
    }

    /** 按 id 读：别人的行交回 null，与「不存在」同形。 / A read by id: another's row comes back as nothing. */
    @Around("execution(* cn.iocoder.yudao.module.infra.service.file.FileService.getFile(..))")
    public Object withholdOthersRow(ProceedingJoinPoint call) throws Throwable {
        Object row = call.proceed();
        Long caller = scope.callerToEnforce();
        if (caller != null && row instanceof FileDO file && !belongsTo(file, caller)) {
            return null;
        }
        return row;
    }

    /**
     * 删除：只认创建者。单删与批量删都走这一条 —— 批量里只要有一行不是调用方的，整次拒绝。
     *
     * Delete: the creator only — for the single and the batch form alike; one foreign id refuses the whole call.
     */
    @Around("execution(* cn.iocoder.yudao.module.infra.service.file.FileService.deleteFile(..))"
            + " || execution(* cn.iocoder.yudao.module.infra.service.file.FileService.deleteFileList(..))")
    public Object requireCreator(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        if (caller != null) {
            for (Long id : idsOf(call.getArgs())) {
                FileDO row = files.selectById(id);
                if (row != null && !belongsTo(row, caller)) {
                    throw new RuleDeniedException(null, "该行不在你的数据范围内", "File",
                            call.getSignature().getName(),
                            "文件只有创建者能删；需要删别人的文件，请让管理员在控制台操作");
                }
            }
        }
        return call.proceed();
    }

    /** The ids a delete carries: a single id, or a collection of them. */
    private static List<Long> idsOf(Object[] args) {
        if (args.length == 0) {
            return List.of();
        }
        if (args[0] instanceof Long id) {
            return List.of(id);
        }
        if (args[0] instanceof Collection<?> ids) {
            return ids.stream().filter(Long.class::isInstance).map(Long.class::cast).toList();
        }
        return List.of();
    }

    private static boolean belongsTo(FileDO row, Long caller) {
        return row.getCreator() != null && row.getCreator().equals(String.valueOf(caller));
    }
}
