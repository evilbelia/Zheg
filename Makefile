.PHONY: ci verify verify-static test test-web test-ai test-api dev build
ci:
	npm run ci
verify-static:
	npm run check
test test-web:
	npm test
build:
	npm run build
verify:
	npm run test:e2e
dev:
	npm run dev
test-ai test-api:
	@echo "不涉及：本项目为浏览器扩展，无独立 AI / Java API 服务。模型协议测试包含在 npm test 中。"
