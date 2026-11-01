// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.instance.BpmProcessInstanceCancelReqVO;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.instance.BpmProcessInstancePageReqVO;
import cn.iocoder.yudao.module.bpm.enums.task.BpmProcessInstanceStatusEnum;
import cn.iocoder.yudao.module.bpm.framework.flowable.core.enums.BpmnVariableConstants;
import cn.iocoder.yudao.module.bpm.service.task.BpmProcessInstanceService;
import cn.iocoder.yudao.module.bpm.service.task.BpmTaskService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.task.api.Task;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 流程实例的工具面：一读一写。BPM 的第二个工具面（第一个是请假单），也是第一个跑在**引擎表**上的面——行不在本宿主
 * 自己的 schema 里，属主不是列，而是引擎字段 `startUserId`。
 *
 * <p><b>读为什么只投影五个字段。</b>流程实例旁边挂着**流程变量与表单内容**：`getProcessInstancePage` 的查询本身带
 * `includeProcessVariables`，实例上就能取到整张变量表。工具面不投影它——出去的是「有哪几个流程」这条业务事实：
 * 编号、业务键、发起时间、状态、当前任务名。变量与表单是**业务数据**，要不要给 AI 看是一个单独的决定，这里不做。
 *
 * <p><b>写为什么敢开。</b>撤回只看自己发起的实例：模块自己的 `cancelProcessInstanceByStartUser` 就比对 `startUserId`，
 * 而 {@link BpmProcessInstanceGovernance} 在工具路径上把同一个答案提前成一次可读的拒绝；工具本身传的是
 * `principal.userId()`，连管理员走这条工具也撤回不了别人的流程。撤回仍走 R3——引擎先扣下等一个人。
 *
 * <p><b>写为什么带 `reason`。</b>上游的取消 VO 把理由声明为必填（`@NotEmpty`），缺了会在**批准之后**被服务端校验拒绝，
 * 那比不声明更糟。故工具把理由列为可选：调用方省略时补一句默认原因，而不是让一次已经批准的写卡在校验上。
 *
 * <p><b>当前任务名借的是 `BpmTaskService` 的读。</b>任务名只用于投影，本面不写任务；任务面作为独立对象受治理
 * （账本里 `bpm task` 仍是 gap），这里只是读它，不假装它已接入。
 *
 * <p>The process-instance tool face: one read and one write. BPM's second face (the leave request was the first) and the
 * first that runs on the **engine's tables** — the row is not in this host's own schema, the owner is not a column but
 * the engine's `startUserId`.
 *
 * <p><b>Why the read projects five fields only.</b> Process variables and form content hang off the instance:
 * `getProcessInstancePage` queries with `includeProcessVariables`, so the whole variable map is one call away. This
 * face does not project it — what leaves is the business fact "which processes exist": id, business key, start time,
 * status and the current task's name. Variables and forms are **business data**, and handing them to the AI is a
 * separate decision, not one made here.
 *
 * <p><b>Why the write is safe to open.</b> Withdrawal only ever touches instances the caller started: the module's own
 * `cancelProcessInstanceByStartUser` compares `startUserId`, and {@link BpmProcessInstanceGovernance} raises the same
 * answer early on the tool path as a readable refusal; the tool passes `principal.userId()`, so even an administrator
 * cannot withdraw someone else's process through it. It is still R3 — the engine holds it for a human.
 *
 * <p><b>Why the write carries `reason`.</b> Upstream's cancel VO declares the reason required (`@NotEmpty`); omitting it
 * would be refused by server-side validation **after** approval, which is worse than not declaring it. The tool keeps
 * the reason optional and supplies a default when the caller omits it, rather than letting an approved write trip on
 * validation.
 *
 * <p><b>The current task name borrows a read from `BpmTaskService`.</b> Task names are projection only — this face
 * writes no task; the task surface is its own object and is still a `gap` in the ledger. It is read here, not claimed
 * as onboarded.
 */
@Configuration
public class BpmProcessInstanceTools {

    @Bean
    AiTool listMyBpmInstances(BpmProcessInstanceService instances, BpmTaskService tasks) {
        return new ListTool(instances, tasks);
    }

    @Bean
    AiTool cancelMyBpmInstance(BpmProcessInstanceService instances) {
        return new CancelTool(instances);
    }

    @Bean
    ModuleRoute bpmInstanceListRoute() {
        return new ListRoute();
    }

    @Bean
    ModuleRoute bpmInstanceCancelRoute() {
        return new CancelRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final BpmProcessInstanceService instances;
        private final BpmTaskService tasks;

        ListTool(BpmProcessInstanceService instances, BpmTaskService tasks) {
            this.instances = instances;
            this.tasks = tasks;
        }

        @Override
        public String name() {
            return "list_my_bpm_instances";
        }

        @Override
        public String description() {
            return "List the BPM process instances the caller started (read-only). Returns id, business key,"
                    + " start time, status and the current task's name — never process variables or form content.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            BpmProcessInstancePageReqVO query = new BpmProcessInstancePageReqVO();
            query.setPageSize(50);
            Long caller = asId(principal.userId());
            // 调用方以**上游自己分页所取的那个入参**传递，于是分页由模块自己收束；即便调用方传 null，通知也会补上。
            // 租户与 acting caller 一并带着走。
            //
            // The caller travels as the argument upstream's own page takes, so the module scopes the page itself — and
            // the advice fills it even if a caller passes null. Tenant and acting caller travel with it.
            List<Map<String, Object>> rows = ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> project(instances.getProcessInstancePage(caller, query))));
            return ToolResult.ok(rows);
        }

        /** The projection: the process as a business fact, without its variables or form. / 投影：流程作为业务事实，不含变量与表单。 */
        private List<Map<String, Object>> project(PageResult<HistoricProcessInstance> page) {
            List<HistoricProcessInstance> list = page.getList();
            if (list.isEmpty()) {
                return List.of();
            }
            Map<String, List<Task>> running = tasks.getTaskMapByProcessInstanceIds(
                    list.stream().map(HistoricProcessInstance::getId).toList());
            return list.stream().map(instance -> project(instance, running.get(instance.getId()))).toList();
        }

        private static Map<String, Object> project(HistoricProcessInstance instance, List<Task> running) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("id", instance.getId());
            safe.put("businessKey", instance.getBusinessKey());
            safe.put("startTime", instance.getStartTime() == null
                    ? null : instance.getStartTime().toInstant().toString());
            safe.put("status", statusOf(instance));
            safe.put("currentTaskName", running == null || running.isEmpty() ? null : running.get(0).getName());
            return safe;
        }

        /** Status is one process variable; reading it here names the one field taken, not the map. / 状态是其中一个流程变量：这里点名取的那一个字段，而不是整张表。 */
        private static Object statusOf(HistoricProcessInstance instance) {
            Map<String, Object> variables = instance.getProcessVariables();
            return variables == null ? null : variables.get(BpmnVariableConstants.PROCESS_INSTANCE_VARIABLE_STATUS);
        }
    }

    /** The phrases this module's read answers to. / 本模块读所回答的短语。 */
    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_my_bpm_instances";
        }

        @Override
        public List<String> triggers() {
            return List.of("我的流程", "我发起的流程", "流程实例列表", "我的流程实例", "看我的流程");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return Map.of();
        }
    }

    /**
     * R3 — a write by id: the engine holds it for a human, and the module (plus the advice) refuses an instance the
     * caller did not start.
     *
     * R3——按 id 的写：引擎扣下等人；不是调用方发起的实例，模块与通知都会拒绝。
     */
    static final class CancelTool implements AiTool {

        private final BpmProcessInstanceService instances;

        CancelTool(BpmProcessInstanceService instances) {
            this.instances = instances;
        }

        @Override
        public String name() {
            return "cancel_my_bpm_instance";
        }

        @Override
        public String description() {
            return "Withdraw a BPM process instance the caller started. The engine holds the call for a human;"
                    + " an instance started by someone else is refused, even after approval.";
        }

        @Override
        public String riskLevel() {
            return "R3";
        }

        @Override
        public String resultType() {
            return "bpm_process_instance";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("id", ToolParameter.STRING, "流程实例编号"),
                    ToolParameter.optional("reason", ToolParameter.STRING, "撤回原因（省略时补默认原因）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            String id = str(args.get("id"));
            if (id == null || id.isBlank()) {
                return ToolResult.fail("id is required");
            }
            String reason = str(args.get("reason"));
            BpmProcessInstanceCancelReqVO request = new BpmProcessInstanceCancelReqVO();
            request.setId(id);
            // VO 把理由声明为必填；补一句缺省理由，免得一次已批准的在服务端校验上失败。
            //
            // The VO declares the reason required; a default keeps an approved write from failing on validation.
            request.setReason(reason == null || reason.isBlank() ? "通过 AI 助手撤回" : reason);
            Long caller = asId(principal.userId());
            YudaoGovernedCall.write(principal.userId(), () -> {
                instances.cancelProcessInstanceByStartUser(caller, request);
                return null;
            });
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", id);
            out.put("status", BpmProcessInstanceStatusEnum.CANCEL.getStatus());
            return ToolResult.ok(out);
        }
    }

    static final class CancelRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "cancel_my_bpm_instance";
        }

        @Override
        public List<String> triggers() {
            return List.of("撤回流程", "撤回我的流程", "取消我的流程", "撤销流程", "撤回我发起的流程");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            // The instance travels as `targetId`, the runtime's one generic structured slot. / 实例以 `targetId` 传递：运行时唯一的通用结构化槽位。
            if (context.get("targetId") != null) {
                args.put("id", context.get("targetId"));
            }
            return args;
        }
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static Long asId(String value) {
        if (value == null) {
            return null;
        }
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException notAnId) {
            return null;
        }
    }
}
