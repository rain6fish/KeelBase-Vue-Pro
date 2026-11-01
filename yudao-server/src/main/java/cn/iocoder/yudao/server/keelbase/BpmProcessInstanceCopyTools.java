// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.bpm.controller.admin.task.vo.instance.BpmProcessInstanceCopyPageReqVO;
import cn.iocoder.yudao.module.bpm.dal.dataobject.task.BpmProcessInstanceCopyDO;
import cn.iocoder.yudao.module.bpm.service.task.BpmProcessInstanceCopyService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 流程抄送的工具面：**只有一读，没有写**。BPM 的第四个工具面，属主是行上的 `user_id`——被抄送的人。
 *
 * <p><b>它回答的是哪条业务事实。</b>「有哪些流程被抄送到我这儿」。抄送**不是待办**：清单里的人既不需要办、也办不了，
 * 系统把他们挂上来只是让他们知道。故它与 {@link BpmTaskTools} 的 `list_my_bpm_todos` 是两条不同的事实，不是同一条的
 * 重复投影；两者也不互相包含——待办里的流程多半没抄送我，抄送我的流程也不等我批。
 *
 * <p><b>为什么不开写。</b>抄送这条路上人能做的那件事是 `copyTask`——给**别人**加抄送。它落在别人的收件箱里，不是
 * 「只影响自己」；而且它已经由 {@link BpmTaskGovernance} 在工具路径上整条拒绝。另一条写是引擎的抄送节点自己在流程
 * 执行里扇出的，不是 AI 的动作。故这里**读**，写留给模块自己的审批界面。
 *
 * <p><b>读为什么只投影五个字段。</b>出去的是「哪些流程抄送到了我这里」这条业务事实：抄送行编号、流程实例编号、
 * 流程名、抄送所在的节点名、抄送时间。**不投影**：被抄送人 `userId` 与发起人 `startUserId`（身份字段，管理端红线是
 * 身份在出口掩码）、抄送意见 `reason` 原文（业务数据，与 {@link BpmTaskTools} 不投影审批意见同一条口径）。本工具
 * 还**不作**审批判定、不读流程变量与表单——那些是另一个决定。
 *
 * <p><b>收件人是谁由切面回答，不由参数回答。</b>调用方以**上游分页自己的那个入参**传递，于是收窄由模块自己按
 * `user_id` 做（见 {@link BpmProcessInstanceCopyGovernance}）；参数表里没有「user」这一格可以传别人的 id，也就没有
 * 可被填错的地方。租户与 acting caller 一并带着走。
 *
 * <p>The process-copy tool face: **one read, no write**. BPM's fourth face; its owner is the row's `user_id` — the
 * person copied.
 *
 * <p><b>The business fact it answers.</b> "Which process instances were copied to me." A copy is **not a todo**: nobody
 * on that list owes a decision and none of them can make one; the system put them there so they would know. So this is a
 * different fact from {@link BpmTaskTools}' `list_my_bpm_todos`, not a second projection of it — and the two do not
 * contain each other: most instances in my todos were never copied to me, and the ones copied to me are not waiting on
 * me.
 *
 * <p><b>Why no write.</b> The human action on this path is `copyTask` — adding a copy to **someone else**, which lands in
 * someone else's inbox and so is not "affects only me"; it is already refused outright on the tool path by
 * {@link BpmTaskGovernance}. The other write is the engine's copy node fanning out during a process execution, which is
 * not an AI action at all. So: **read**, and writing stays on the module's own approval screens.
 *
 * <p><b>Why the read projects five fields only.</b> What leaves is the business fact "these instances were copied to
 * me": copy id, process instance id, process name, the node the copy sits on, and when. **Not projected**: the recipient
 * `userId` and the starter `startUserId` (identity fields, which the admin console's red line masks at the edge), and
 * the copy opinion `reason` (business data — the same line {@link BpmTaskTools} draws for approval comments). This face
 * also makes **no** approval judgement and reads no process variables or form data; those are separate decisions.
 *
 * <p><b>Who the recipient is, the aspect answers — not an argument.</b> The caller travels as the argument upstream's own
 * page takes, so the narrowing is the module's own `user_id` filter (see {@link BpmProcessInstanceCopyGovernance}). There
 * is no "user" slot in the parameter list for someone else's id to be filled into — and therefore nothing to fill it
 * wrong. The tenant and the acting caller travel with it.
 */
@Configuration
public class BpmProcessInstanceCopyTools {

    @Bean
    AiTool listMyBpmProcessCopies(BpmProcessInstanceCopyService copies) {
        return new ListTool(copies);
    }

    @Bean
    ModuleRoute bpmProcessInstanceCopyListRoute() {
        return new ListRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final BpmProcessInstanceCopyService copies;

        ListTool(BpmProcessInstanceCopyService copies) {
            this.copies = copies;
        }

        @Override
        public String name() {
            return "list_my_bpm_process_copies";
        }

        @Override
        public String description() {
            return "List the BPM process instances copied to the caller (read-only). Returns copy id, process instance"
                    + " id, process name, the node the copy sits on and when it was copied — never the recipient or"
                    + " starter identity, the copy opinion, process variables or form content. These are not tasks:"
                    + " nothing here is waiting on the caller.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            BpmProcessInstanceCopyPageReqVO query = new BpmProcessInstanceCopyPageReqVO();
            query.setPageSize(50);
            Long caller = asId(principal.userId());
            // 调用方以**上游自己分页所取的那个入参**传递，于是分页由模块自己按 `user_id` 收束；租户与 acting caller
            // 一并带着走。
            //
            // The caller travels as the argument upstream's own page takes, so the module scopes by `user_id` itself —
            // and the tenant and acting caller travel with it.
            PageResult<BpmProcessInstanceCopyDO> page = ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> copies.getProcessInstanceCopyPage(caller, query)));
            return ToolResult.ok(project(page.getList()));
        }

        /** A copy as a business fact: five fields, no identity, no opinion text. / 抄送作为业务事实：五个字段，无身份、无意见原文。 */
        private static List<Map<String, Object>> project(List<BpmProcessInstanceCopyDO> rows) {
            return rows.stream().map(ListTool::project).toList();
        }

        private static Map<String, Object> project(BpmProcessInstanceCopyDO copy) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("id", copy.getId());
            safe.put("processInstanceId", copy.getProcessInstanceId());
            safe.put("processName", copy.getProcessInstanceName());
            safe.put("activityName", copy.getActivityName());
            safe.put("createTime", copy.getCreateTime() == null ? null : copy.getCreateTime().toString());
            return safe;
        }
    }

    /** The phrases this module's read answers to. / 本模块读所回答的短语。 */
    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_my_bpm_process_copies";
        }

        @Override
        public List<String> triggers() {
            return List.of("我的抄送", "抄送我的流程", "抄送给我的", "我收到的抄送", "抄送列表");
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
