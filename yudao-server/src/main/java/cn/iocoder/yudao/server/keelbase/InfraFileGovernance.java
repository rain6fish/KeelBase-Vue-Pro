// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.module.infra.dal.dataobject.file.FileDO;
import cn.iocoder.yudao.module.infra.dal.mysql.file.FileMapper;
import java.util.List;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

/**
 * 文件（`infra_file`）的治理在模块自己的接缝上——M2 的第二个对象，也是 infra 里除示例联系人之外的第二个业务面。
 * 与示例联系人同形：行上没有属主列，属主是审计串 `creator`；而模块**没有可对齐的权限表**，故本切面的写侧只认
 * 「创建者」，这是本宿主的**口径**。
 *
 * <p><b>逐条回答 onboarding §2.1 的四问（读的是上游这一版的 `FileService` / `Impl` / `Mapper` / `VO`）。</b>
 *
 * <ol>
 *   <li><b>分页无过滤返回什么？</b><b>全表</b>。`getFilePage(FilePageReqVO)` 直接交给 `FileMapper.selectPage`，
 *       而那个查询只按路径、MIME 类型与创建时间过滤，**从不拼调用方条件**；`FileDO` 上还带 `@TenantIgnore`，
 *       连租户都不参与收束。故本切面只能在模块答完之后**后过滤到 `creator == 调用方`**，并按本页留下的行数
 *       **重算 total**（口径见下）。</li>
 *   <li><b>按 id 读是否收窄？</b>**不收窄**：`getFile(Long)` 就是 `validateFileExists` 里的一句裸 `selectById`，
 *       只有「不存在就抛 `FILE_NOT_EXISTS`」这一条规则。别人的行照旧整行回来，故本切面把它换成**空**——与不存在的
 *       那一行给出同一个答案。</li>
 *   <li><b>保存 VO 能否指认别人为属主？</b>**不能**。`FileUploadReqVO` 与 `FileCreateReqVO` 上都没有 creator / owner
 *       字段，上传与建记录都不接受属主，故不需要「顶掉入参属主」那一条通知。也**不加**创建盖章：本面没有创建工具，
 *       而唯一的创建路（multipart 上传）带着真实的安全上下文，框架的审计字段处理器会把 `creator` 填上；且那条路返回的
 *       是 URL、不是 id，按 id 回写也无从下手。</li>
 *   <li><b>删除是否查属主？</b>**不查**。`deleteFile(id)` 只校验存在与路径合法，然后从存储器与库里删；
 *       `deleteFileList(ids)` 同样按 id 批量删。故归属在这里、在写跑起来之前回答，**只认创建者**——模块没有权限表
 *       可对齐，这是本宿主的口径（与示例联系人同一句）。</li>
 * </ol>
 *
 * <p><b>分页 total 的口径：本页的。</b>后过滤留多少行、total 就是多少行。一页装不下时，调用方看到的总量描述的是
 * **这一页**、不是整张表；要一个真正的按人总量，得由模块自己的查询带上调用方条件，切面编不出来。这是**声明的收窄**，
 * 与 {@code Demo01ContactGovernance} 同一口径。
 *
 * <p><b>刻意不碰的路。</b>下载（`getFileContent` / `getFileByConfigIdAndPath`；端点是 `/infra/file/{configId}/get/**`，
 * 带 `@PermitAll` 与 `@TenantIgnore`）不按行收窄：文件 URL 本身就是凭据，按属主收窄会让已经发出去的图片链接全部失效。
 * 工具面因此**不投影** path / url / configId——AI 拿不到存储细节，也就拼不出那条下载地址。`presignPutUrl` /
 * `presignGetUrl` 只造签名、不碰行，不在这条接缝上。
 *
 * <p><b>没有补偿器。</b>本面唯一的写是删除，而文件内容删了就回不来——撤销它没有可做的事。故不声明 compensator：
 * 运行时撤销 `infra_file` 时会以「没有这条路」拒绝，那比一个假装能复原的补偿器诚实。
 *
 * <p>Governance for files (`infra_file`) at the module's own seam — M2's second object and, after the demo contact,
 * the second business surface in infra. It has the demo contact's shape: rows carry no owner column, the owner is
 * the audit string `creator`, and the module has **no permission table to align with** — so the write side accepts
 * only the creator, and that is **this host's rule**.
 *
 * <p><b>The four onboarding §2.1 questions, answered from upstream's code.</b> (1) A page returns the **whole
 * table**: `getFilePage` hands straight to `FileMapper.selectPage`, which filters on path, MIME type and created
 * time and never joins a caller condition — and `FileDO` is `@TenantIgnore`, so not even the tenant narrows. The
 * advice can only let the module answer and then keep rows whose `creator` is the caller, recomputing `total` from
 * the rows this page kept. (2) A read by id is not scoped: `getFile` is a bare `selectById` that only raises
 * `FILE_NOT_EXISTS` when the row is missing, so another's row comes back whole and the advice answers nothing
 * instead. (3) No save VO lets a client name an owner — neither upload nor create takes a creator — so there is no
 * owner argument to overwrite, and no create stamp is added either: this face has no create tool, the one create
 * path (multipart upload) carries a real security context so the audit handler fills `creator`, and that path
 * returns a URL rather than an id. (4) Delete checks no owner: `deleteFile` validates existence and the path only,
 * then removes from storage and the table, and `deleteFileList` deletes by id in bulk — so ownership is answered
 * here, before the write runs, and only the creator passes.
 *
 * <p><b>The page total describes this page.</b> The rows kept become the total; when more rows exist than one page
 * holds, the caller's count describes the page, not the table. That is the declared narrowing `Demo01ContactGovernance`
 * already writes down.
 *
 * <p><b>Paths deliberately left alone.</b> Download (`getFileContent` / `getFileByConfigIdAndPath`, on the
 * `@PermitAll` `@TenantIgnore` endpoint `/infra/file/{configId}/get/**`) is not narrowed by row: the file URL is the
 * credential, and narrowing it would break every image link already handed out. The tool face therefore projects no
 * path, URL or config id — the AI cannot learn the storage details and so cannot compose that address. The presign
 * methods only mint signatures and touch no row.
 *
 * <p><b>No compensator.</b> This face's only write is a delete, and deleted content does not come back, so there is
 * nothing to undo. No compensator is declared: the runtime refuses a revoke of `infra_file` by naming the missing
 * path, which is more honest than a compensator pretending it can restore the file.
 */
@Aspect
@Component
public class InfraFileGovernance implements GovernedModule {

    private final YudaoModuleScope scope;
    private final FileMapper mapper;

    public InfraFileGovernance(YudaoModuleScope scope, FileMapper mapper) {
        this.scope = scope;
        this.mapper = mapper;
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
     * 分页在模块答完之后收窄：范围机器豁免的调用方不动，其余人只留 `creator` 等于自己 id 的行，total 随之重算为
     * **本页留下的行数**。
     *
     * The page, narrowed after the module has answered. A caller the scope machine exempts is left alone; everyone
     * else keeps only rows whose `creator` is their own id, and the total is recomputed as **the rows this page
     * kept**.
     */
    @Around("execution(* cn.iocoder.yudao.module.infra.service.file.FileService.getFilePage(..))")
    @SuppressWarnings("unchecked")
    public Object narrowToCaller(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object outcome = call.proceed();
        if (caller == null || !(outcome instanceof PageResult<?> page)) {
            return outcome;
        }
        List<FileDO> mine = ((PageResult<FileDO>) page).getList().stream()
                .filter(row -> scope.belongsToCaller(row.getCreator(), caller))
                .toList();
        return new PageResult<>(mine, (long) mine.size());
    }

    /**
     * 按 id 读是一句裸 `selectById`；别人的行**什么都不交回**——与不存在的那一行给出同一个答案。
     *
     * A read by id is a bare `selectById`; another's row is handed back as nothing — the same answer a row that is
     * not there gives.
     */
    @Around("execution(* cn.iocoder.yudao.module.infra.service.file.FileService.getFile(..))")
    public Object withholdOthersRow(ProceedingJoinPoint call) throws Throwable {
        Object row = call.proceed();
        Long caller = scope.callerToEnforce();
        if (caller != null && row instanceof FileDO found
                && !scope.belongsToCaller(found.getCreator(), caller)) {
            return null;
        }
        return row;
    }

    /**
     * 删除按 id：模块不查归属，故在这里、在写跑起来之前回答。别人的文件**拒绝**，被拒正是落进审计的那一条。
     *
     * Delete by id: the module asks whose row it is not at all, so the question is answered here, before the write
     * runs. Another person's file is **refused**, and the refusal is what lands in the audit.
     */
    @Around("execution(* cn.iocoder.yudao.module.infra.service.file.FileService.deleteFile(..))")
    public Object requireOwnership(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object[] args = call.getArgs();
        if (caller != null && args.length >= 1 && args[0] instanceof Long id) {
            FileDO existing = mapper.selectById(id);
            scope.requireOwned(existing == null ? null : existing.getCreator(),
                    caller, "File", "delete");
        }
        return call.proceed();
    }

    /**
     * 批量删除收的是**一列 id**，故逐个查：任何一行不是调用方建的，整次调用就被拒——与单条删除同一条口径。
     *
     * The bulk delete takes a **list of ids**, so each row is looked up: if any row was not created by the caller the
     * whole call is refused — the same rule as the single delete.
     */
    @Around("execution(* cn.iocoder.yudao.module.infra.service.file.FileService.deleteFileList(..))")
    public Object requireOwnershipOfEveryRow(ProceedingJoinPoint call) throws Throwable {
        Long caller = scope.callerToEnforce();
        Object[] args = call.getArgs();
        // 签名就是 `deleteFileList(List<Long>)`，故实参的形状是确定的。
        // The signature is `deleteFileList(List<Long>)`, so the argument's shape is fixed.
        if (caller != null && args.length >= 1 && args[0] instanceof List<?> raw) {
            List<Long> ids = raw.stream().filter(Long.class::isInstance).map(Long.class::cast).toList();
            if (!ids.isEmpty()) {
                for (FileDO existing : mapper.selectByIds(ids)) {
                    scope.requireOwned(existing.getCreator(), caller, "File", "delete");
                }
            }
        }
        return call.proceed();
    }
}
