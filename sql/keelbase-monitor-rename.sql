-- 监控中心：MySQL 监控 → 数据库监控（与 9 份种子 sql 的同样两行同值）。
-- 连接池保持 Hikari（scripts/run-server.sh 第 68 行），不再换回 Druid ⇒ 芋道自带的 Druid stat-view-servlet
-- 底下没有 Druid 池可报；故 infra_config 7 的名字随种子写成「HikariCP 监控（通过 Spring Boot Admin）」。
-- ⚠ 那条路**尚未接上**：yudao-server 不依赖 yudao-spring-boot-starter-monitor，而该 starter 只有 tracer/metrics。
--    只读核查：KeelBase-Private/KeelBase-Vue-Pro/工作树未提交改动-只读盘点_2026-10-14.md §8。
UPDATE system_menu SET name = '数据库监控', visible = true WHERE id = 15;
UPDATE infra_config SET name = 'HikariCP 监控（通过 Spring Boot Admin）' WHERE id = 7;
