// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.infra.controller.admin.file.vo.file.FilePageReqVO;
import cn.iocoder.yudao.module.infra.dal.dataobject.file.FileDO;
import cn.iocoder.yudao.module.infra.service.file.FileService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * infra 文件的工具面：**只有一个读**。
 *
 * <p><b>为什么没有写。</b>这个模块的写只有两种形状，两种都不该由模型递过来：
 *
 * <ul>
 *   <li><b>上传</b>收的是**二进制内容**（`createFile(byte[], …)`）并返回一个**路径**而不是 id —— 让模型把文件内容塞进
 *       工具入参，等于给 AI 开一条「往这台机器写任意字节」的路，而它的结果也没有可登记的 id，副作用台账接不住。</li>
 *   <li><b>删除</b>有后果且不可逆；`InfraFileGovernance` 已经把「只认创建者」写进切面，真截断由人在控制台做。</li>
 * </ul>
 *
 * <p>于是这一面只回答一个问题：**我有哪些文件**。投影里**没有** `path`、`url`、`configId` —— 存储坐标不外泄；出去的
 * 是 id、名称、大小、类型与创建时间。
 *
 * <p>The infra file tool face is a **read only**. Both writes this module has are the wrong shape for a model: an
 * upload carries raw bytes and returns a path rather than an id (a hole to write arbitrary bytes onto this host, with
 * no id for the side-effect ledger to record), and a delete is irreversible — the aspect already restricts it to the
 * creator, and a person does it in the console. So the face answers one question, "which files are mine", and its
 * projection carries no `path`, `url` or `configId`.
 */
@Configuration
public class InfraFileTools {

    @Bean
    AiTool listMyInfraFiles(FileService service) {
        return new ListTool(service);
    }

    @Bean
    ModuleRoute infraFileListRoute() {
        return new ListRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final FileService service;

        ListTool(FileService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_my_infra_files";
        }

        @Override
        public String description() {
            return "List the files this caller uploaded (read-only). Storage paths and URLs are not projected;"
                    + " uploading and deleting are done in the console, not by the assistant.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            FilePageReqVO query = new FilePageReqVO();
            query.setPageSize(50);
            // 分页没有调用方参数，故收窄由切面对返回页做（并重算 total）—— 身份仍要带，切面才读得到调用方。
            // The page takes no caller argument, so the seam filters the returned page (recomputing `total`); the
            // identity still has to travel for the advice to read it.
            List<Map<String, Object>> rows = ActingCaller.as(principal.userId(),
                            () -> TenantUtils.execute(YudaoCallerTenant.current(),
                                    () -> service.getFilePage(query))).getList().stream()
                    .map(ListTool::project)
                    .toList();
            return ToolResult.ok(rows);
        }

        /** The fields that leave this tool — a projection is where that decision is legible. */
        private static Map<String, Object> project(FileDO row) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("id", row.getId());
            safe.put("name", row.getName());
            safe.put("size", row.getSize());
            safe.put("type", row.getType());
            safe.put("createdAt", row.getCreateTime() == null ? null : row.getCreateTime().toString());
            return safe;
        }
    }

    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_my_infra_files";
        }

        @Override
        public List<String> triggers() {
            return List.of("列出文件", "我的文件", "文件列表", "有哪些文件");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return Map.of();
        }
    }
}
