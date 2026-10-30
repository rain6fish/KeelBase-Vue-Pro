// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.iocoder.yudao.framework.common.pojo.CommonResult;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 台账「哪个业务对象」那一格的名字来源：一条只读端点，**不要求任何额外权限**——已登录即可问，问得到的范围由
 * {@link YudaoRecordNames} 按「这个引用本来就在账本里出现过」裁剪，名字在服务端就掩码。
 *
 * <p>它为什么是一条新端点而不是给读者补权限：与 F-14（人名）同一个裁定——把引用 → 名字这次**联结**交给服务端，
 * 读者的授予一条不动。给 `audit_reader` 补 `crm:customer:query` 的另一条路，会连 `/crm/customer/get` 一起打开：
 * 那条端点**不做数据范围检查**，答的是「库里任何一条记录」，不是「这次操作涉及的那一条」。本条只答后者。
 *
 * <p><b>English</b>
 *
 * <p>Where the ledger's "which business object" cell gets its record names: one read-only endpoint that
 * **requires no extra permission** — any signed-in caller may ask, and {@link YudaoRecordNames} bounds the
 * answer to references that already appear in a ledger, with names masked server-side. A new endpoint
 * rather than another grant for the reader, for the same reason as F-14: the join moves to the server and
 * no reader's grant changes. The other road — granting `crm:customer:query` — would open
 * `/crm/customer/get` too, which applies **no data scope** and answers "any record in the table" instead of
 * "the record this operation touched". This face answers only the latter.
 */
@RestController
public class YudaoRecordNamesController {

    /** 记录的引用：`类型:主键`，与运行时自己的形状一致（`crm_customer:9005`）。 / `type:key`, the runtime's own shape. */
    private static final Pattern TYPE = Pattern.compile("[a-z][a-z0-9_]{0,63}");

    private final YudaoRecordNames directory;
    private final YudaoCallerId callers;

    public YudaoRecordNamesController(YudaoRecordNames directory, YudaoCallerId callers) {
        this.directory = directory;
        this.callers = callers;
    }

    /**
     * `GET /admin-api/keelbase/record-names?refs=crm_customer:9005` → `[{type, id, name}]`，只含这个调用方
     * 可以知道名字的那些，名字已掩码。
     *
     * <p>解析不出来的那几段被丢掉而不是报错：这条端点做的是**补名字**，页面本来就同时画着类型与主键。
     *
     * <p>`GET .../record-names?refs=...` → `[{type, id, name}]` for those this caller may name, names
     * masked. Pieces that do not parse are dropped rather than rejected: the endpoint only adds names, and
     * the page draws the type and the key anyway.
     */
    @GetMapping("/admin-api/keelbase/record-names")
    public CommonResult<List<Map<String, Object>>> names(
            @RequestParam(value = "refs", required = false) String refs) {
        List<YudaoRecordNames.Named> named = directory.namesFor(callers.current(), parse(refs));
        List<Map<String, Object>> body = new ArrayList<>(named.size());
        for (YudaoRecordNames.Named row : named) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("type", row.type());
            item.put("id", row.id());
            item.put("name", row.name());
            body.add(item);
        }
        return CommonResult.success(body);
    }

    /**
     * 只收 `类型:十进制主键`，去重，最多 {@link YudaoRecordNames#MAX_REFS} 个；形状不对的那段直接丢掉。
     *
     * <p>`type:decimal-key` only, deduped and capped; a piece of any other shape is dropped.
     */
    static List<YudaoRecordNames.Ref> parse(String refs) {
        List<YudaoRecordNames.Ref> parsed = new ArrayList<>();
        if (refs == null || refs.isBlank()) {
            return parsed;
        }
        Set<String> seen = new LinkedHashSet<>();
        for (String piece : refs.split(",")) {
            String trimmed = piece.trim();
            int colon = trimmed.indexOf(':');
            if (colon <= 0 || colon == trimmed.length() - 1) {
                continue;
            }
            String type = trimmed.substring(0, colon).trim();
            String key = trimmed.substring(colon + 1).trim();
            if (!TYPE.matcher(type).matches()
                    || key.length() > 18
                    || !key.chars().allMatch(Character::isDigit)) {
                continue;
            }
            long id;
            try {
                id = Long.parseLong(key);
            } catch (NumberFormatException notAKey) {
                continue;
            }
            if (id <= 0 || !seen.add(type + "#" + id)) {
                continue;
            }
            parsed.add(new YudaoRecordNames.Ref(type, id));
            if (parsed.size() >= YudaoRecordNames.MAX_REFS) {
                break;
            }
        }
        return parsed;
    }
}
