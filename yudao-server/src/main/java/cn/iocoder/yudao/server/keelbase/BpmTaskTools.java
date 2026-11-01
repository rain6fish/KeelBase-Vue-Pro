// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.task.BpmTaskPageReqVO;
import cn.iocoder.yudao.module.bpm.service.definition.BpmProcessDefinitionService;
import cn.iocoder.yudao.module.bpm.service.task.BpmTaskService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.task.api.Task;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 流程任务的工具面：**只有一读，没有写**。BPM 的第三个工具面，属主是**分派人 `assignee`**——不是发起人、不是行上的列。
 *
 * <p><b>为什么不开写。</b>分派给我的任务，**办它**是我的职责，但它的**效果**落在**别人发起的那个流程实例**上：一次审批
 * 推进（或终止）的是发起人的业务记录，还会把下一个节点推到别人手里。D5 甲的判据是「**只影响自己**」才开写——流程实例
 * 那条面能开撤回，正是因为那里的调用方**就是发起人本身**；任务这条面不满足它，分派是**职责**，不是**归属**。另外还有
 * 一条机械的：审批的 VO 带着 `variables`（动态表单）与 `nextAssignees`（下一个节点的人选）两个槽，最小工具填不了它们，
 * 声明一个会把表单数据**静默丢掉**、或在「审批人自选」节点上必然失败的写，比不声明更糟。故读写面的决定就在这里：**读**。
 * 要办任务，走模块自己的审批界面——那里引擎照样扣人、照样留痕。
 *
 * <p><b>读为什么只投影五个字段。</b>待办分页的查询本身带 `includeProcessVariables`，返回的任务对象上就挂着**整张流程
 * 变量表**；旁边还有表单与审批意见（评论）。工具面不投影它们——出去的是「我有哪几件待办」这条业务事实：任务编号、
 * 流程实例编号、流程名、当前节点名、创建时间。变量、表单与意见原文是**业务数据**，要不要给 AI 看是另一个决定。
 *
 * <p><b>流程名借的是流程**定义**的读，不是流程实例的读。</b>取名字本可以问 `BpmProcessInstanceService.getProcessInstance`
 * 拿 `getProcessDefinitionName()`，但那条读被 {@link BpmProcessInstanceGovernance} 在工具路径上按 `startUserId` 收窄过，
 * 而**分派给我的任务恰好常常是别人发起的流程**——那样取到的会是 `null`。所以这里问的是**定义**（`BpmProcessDefinitionService`，
 * 按 `processDefinitionId` 取名），它与哪个人发起、哪个人审批都无关，也就不跨到另一条面的收窄里去。
 *
 * <p>The task tool face: **one read, no write**. BPM's third face; its owner is the **assignee** — not a starter, not a
 * column.
 *
 * <p><b>Why no write.</b> For a task assigned to me, deciding it is my **duty**, but the **effect** lands on a process
 * instance **someone else started**: one approval advances (or ends) the starter's business record and hands the next
 * node to another person. D5's test is "it only affects me" — the instance face could open its withdrawal precisely
 * because there the caller **is the starter**; this face does not pass that test, because assignment is a **duty**, not
 * **ownership**. There is a mechanical reason too: the approve VO carries `variables` (the dynamic form) and
 * `nextAssignees` (who decides next), which a minimal tool cannot fill; declaring a write that would silently drop form
 * data, or necessarily fail on a select-the-next-approver node, is worse than declaring none. So the decision is made
 * here once: **read only**. To decide a task, use the module's own approval screen — the engine still holds it for a
 * human there, and still records it.
 *
 * <p><b>Why the read projects five fields only.</b> The todo query runs with `includeProcessVariables`, so the returned
 * task carries the whole variable map; the form and the approval comments are one call away too. This face does not
 * project them — what leaves is the business fact "these are my open tasks": task id, process instance id, process name,
 * current node name, created time. Variables, forms and comment text are **business data**, and handing them to the AI
 * is a separate decision.
 *
 * <p><b>The process name borrows the process **definition** read, not the instance read.</b> The name could come from
 * `BpmProcessInstanceService.getProcessInstance(...).getProcessDefinitionName()`, but that read is narrowed by
 * {@link BpmProcessInstanceGovernance} to the starter on the tool path — and a task assigned to me usually belongs to a
 * process **someone else started**, so it would come back `null`. This asks the **definition** instead (by
 * `processDefinitionId`), which has nothing to do with who started or who approves, and so stays out of the other
 * face's narrowing.
 */
@Configuration
public class BpmTaskTools {

    @Bean
    AiTool listMyBpmTodos(BpmTaskService tasks, BpmProcessDefinitionService definitions) {
        return new ListTool(tasks, definitions);
    }

    @Bean
    ModuleRoute bpmTaskListRoute() {
        return new ListRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final BpmTaskService tasks;
        private final BpmProcessDefinitionService definitions;

        ListTool(BpmTaskService tasks, BpmProcessDefinitionService definitions) {
            this.tasks = tasks;
            this.definitions = definitions;
        }

        @Override
        public String name() {
            return "list_my_bpm_todos";
        }

        @Override
        public String description() {
            return "List the BPM tasks assigned to the caller (read-only). Returns id, process instance id, process"
                    + " name, current node name and created time — never task variables, form content or approval"
                    + " comments.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            BpmTaskPageReqVO query = new BpmTaskPageReqVO();
            query.setPageSize(50);
            Long caller = asId(principal.userId());
            // 调用方以**上游自己分页所取的那个入参**传递，于是分页由模块自己按 assignee 收束；租户与 acting caller
            // 一并带着走。
            //
            // The caller travels as the argument upstream's own page takes, so the module scopes by assignee itself —
            // and the tenant and acting caller travel with it.
            PageResult<Task> page = ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> tasks.getTaskTodoPage(caller, query)));
            return ToolResult.ok(project(page.getList(), definitions));
        }

        /** A task as a business fact: five fields, no variables, no form, no comment. / 任务作为业务事实：五个字段，无变量、无表单、无意见。 */
        private static List<Map<String, Object>> project(List<Task> rows, BpmProcessDefinitionService definitions) {
            if (rows.isEmpty()) {
                return List.of();
            }
            Map<String, ProcessDefinition> byDefinitionId = definitions.getProcessDefinitionMap(
                    Set.copyOf(rows.stream().map(Task::getProcessDefinitionId).toList()));
            return rows.stream().map(task -> project(task, byDefinitionId.get(task.getProcessDefinitionId()))).toList();
        }

        private static Map<String, Object> project(Task task, ProcessDefinition definition) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("id", task.getId());
            safe.put("processInstanceId", task.getProcessInstanceId());
            safe.put("processName", definition == null ? null : definition.getName());
            safe.put("taskName", task.getName());
            safe.put("createTime", task.getCreateTime() == null ? null : task.getCreateTime().toInstant().toString());
            return safe;
        }
    }

    /** The phrases this module's read answers to. / 本模块读所回答的短语。 */
    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_my_bpm_todos";
        }

        @Override
        public List<String> triggers() {
            return List.of("我的待办", "待办任务", "待我审批", "我的审批", "待办列表", "看我的待办");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return Map.of();
        }
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
