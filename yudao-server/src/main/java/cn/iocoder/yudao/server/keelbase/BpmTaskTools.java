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
import cn.iocoder.yudao.module.bpm.service.task.BpmTaskService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.flowable.task.api.Task;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * BPM 任务的工具面：**只有一条读** —— 调用方自己的待办。
 *
 * <p><b>为什么不开写。</b>审批是人的责任。一次「通过 / 不通过」要看这一节点在流程模型里定的表单、按钮和理由要求，而工具面
 * **刻意不投影**那些内容（见下）；转办、委派、加签则是把一件事交到另一个人手上，同样是人的判断。故这里没有一条写：
 * 不是没做完，是**不该由 AI 按下去**。也正因为如此，本面不需要 `resultType` 与补偿器 —— 没有效果可记。
 *
 * <p><b>为什么这个读没有参数。</b>它问的是「**我**手上有什么待办」：受理人就是调用方自己，再没有第二个可筛的维度。
 * 这同时避开了另一条老坑 —— 引擎会在人批准**之前**以 `invalid_arguments` 拒掉一份缺了必填实参的提议；没有实参，就没有
 * 这一半的失败面。
 *
 * <p><b>投影四个字段，不含任务上的局部变量。</b>`BpmTaskService.getTask(String)` 的查询带
 * `includeTaskLocalVariables`，任务上挂着审批状态、理由与签字图片地址。出去的是「有哪几件事等着我」这条业务事实：
 * 任务编号、名称、创建时间、所属流程实例；审批意见与附件留在模块自己的界面里。
 *
 * BPM's task face: **one read only** — the caller's own todo list.
 *
 * <p><b>Why no write.</b> Approving is a human's job. An approve or reject depends on the form, buttons and reason
 * requirement the process model declares for that node, and this face **deliberately does not project** any of that (see
 * below); transferring, delegating or adding a signer hands the work to another person — also a human's call. So there is
 * no write here: not unfinished work, but work the AI should not press. That is also why this face needs no `resultType`
 * and no compensator — there is no effect to record.
 *
 * <p><b>Why the read takes no arguments.</b> It asks what **I** have waiting: the assignee is the caller, and there is no
 * second dimension to filter on. That also sidesteps an older trap — the engine refuses a proposal missing a required
 * argument with `invalid_arguments` **before** a person is asked; with no arguments there is no such failure half.
 *
 * <p><b>Four projected fields, without the task's local variables.</b> `BpmTaskService.getTask(String)` queries with
 * `includeTaskLocalVariables`, so approval status, reason and the signature image URL hang off the task. What leaves is the
 * business fact "which items are waiting for me": task id, name, create time and the process instance it belongs to. The
 * approval text and attachments stay in the module's own screens.
 */
@Configuration
public class BpmTaskTools {

    /** Enough that a todo list stays a list. / 小到「待办列表」仍是一眼能看完的东西。 */
    private static final int PAGE_SIZE = 20;

    @Bean
    AiTool listMyBpmTasks(BpmTaskService tasks) {
        return new ListTool(tasks);
    }

    @Bean
    ModuleRoute bpmTaskListRoute() {
        return new ListRoute();
    }

    /** The fields that leave this face. / 离开本面的那些字段。 */
    private static Map<String, Object> project(Task task) {
        Map<String, Object> safe = new LinkedHashMap<>();
        safe.put("id", task.getId());
        safe.put("name", task.getName());
        safe.put("createTime", task.getCreateTime() == null ? null : task.getCreateTime().toInstant().toString());
        safe.put("processInstanceId", task.getProcessInstanceId());
        return safe;
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final BpmTaskService tasks;

        ListTool(BpmTaskService tasks) {
            this.tasks = tasks;
        }

        @Override
        public String name() {
            return "list_my_bpm_tasks";
        }

        @Override
        public String description() {
            return "List the BPM approval tasks waiting for the caller, newest first (read-only). Returns task id, name,"
                    + " create time and process instance id — never the task's approval text, attachments or form.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            BpmTaskPageReqVO query = new BpmTaskPageReqVO();
            query.setPageSize(PAGE_SIZE);
            Long caller = asId(principal.userId());
            // 调用方以**上游分页所取的那个入参**传递：模块自己就按受理人收窄，切面再按同一句权限码把关。
            // 租户与 acting caller 一并带着走。
            //
            // The caller travels as the argument upstream's own page takes: the module narrows by assignee itself, and the
            // advice holds it to the same permission code. Tenant and acting caller travel with it.
            PageResult<Task> page = ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> tasks.getTaskTodoPage(caller, query)));
            return ToolResult.ok(page.getList().stream().map(BpmTaskTools::project).toList());
        }
    }

    /** The phrases this module's read answers to. / 本模块读所回答的短语。 */
    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_my_bpm_tasks";
        }

        @Override
        public List<String> triggers() {
            return List.of("我的待办", "我的待办任务", "待我审批", "待我审批的任务", "我的审批任务");
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
