# BPMN 工作流基础设施 (infra) - 学习文档

本文档专注于基础设施层（`infra/` + `docker-compose.yml`），涵盖 Flowable 引擎原理、Spring Boot 集成、Maven 依赖管理、Docker 多阶段构建、容器编排，以及后端如何与 Flowable REST API 通信。

---

## 一、目录结构

```
项目根目录/
├── docker-compose.yml              # 容器编排（定义 Flowable + MySQL 两个服务）
└── infra/
    └── flowable-app/               # 自定义 Flowable Spring Boot 应用
        ├── pom.xml                 # Maven 依赖配置
        ├── Dockerfile              # 多阶段构建（编译 → 运行）
        └── src/main/
            ├── java/com/bpmn/demo/
            │   └── FlowableApplication.java   # Spring Boot 入口类
            └── resources/
                └── application.yml            # Spring Boot + Flowable 配置
```

**infra 在整体架构中的位置**：

```
前端 (React)  →  中间层 (Node.js)  →  Flowable 引擎 (infra/)  →  MySQL
                                        ↑
                                   本文档聚焦
```

infra 层是可选的 —— Mock 模式不需要它，只有在 `MODE=flowable` 时才需要启动。

---

## 二、Flowable 是什么

### 2.1 BPMN 引擎的定位

Flowable 是一个轻量级的 **BPMN 2.0 流程引擎**，用 Java 编写。它的核心能力：

| 能力 | 说明 |
|---|---|
| **流程定义解析** | 读取 BPMN XML，验证语法，构建内部模型 |
| **流程实例执行** | 按照定义的顺序流推进 Token，走过每个节点 |
| **用户任务管理** | 遇到 `<userTask>` 自动创建待办，完成后继续流转 |
| **网关分支** | 排他网关（exclusiveGateway）根据条件走分支 |
| **定时器事件** | 定时触发、延迟执行 |
| **历史记录** | 自动记录每个活动的开始/结束时间 |
| **REST API** | 提供 HTTP 接口，无需写 Java 代码即可操作引擎 |

### 2.2 Flowable vs Camunda vs Activiti

| 引擎 | 来源 | 版本 | 特点 |
|---|---|---|---|
| **Flowable** | Activiti 分支 | 6.x / 7.x | 社区活跃，REST API 完善，Spring Boot 集成好 |
| **Camunda** | Activiti 分支 | 7.x / 8.x | 企业版功能强，8.x 是云原生架构（Zeebe） |
| **Activiti** | 原始项目 | 7.x | Alfresco 主导，偏向内容管理 |

本项目选择 Flowable 的原因：
- REST API 开箱即用，适合 Node.js 中间层调用
- `flowable-spring-boot-starter` 集成简单
- 社区版本功能完整，无需企业版

### 2.3 Flowable 的数据库表

Flowable 启动时会自动创建约 40+ 张表，按前缀分组：

| 前缀 | 含义 | 典型表 |
|---|---|---|
| `ACT_RE_` | Repository（仓库） | `ACT_RE_DEPLOYMENT`（部署）、`ACT_RE_PROCDEF`（流程定义） |
| `ACT_RU_` | Runtime（运行时） | `ACT_RU_EXECUTION`（执行）、`ACT_RU_TASK`（任务） |
| `ACT_HI_` | History（历史） | `ACT_HI_ACTINST`（活动实例）、`ACT_HI_TASKINST`（任务实例） |
| `ACT_ID_` | Identity（身份） | `ACT_ID_USER`（用户）、`ACT_ID_GROUP`（组） |
| `ACT_GE_` | General（通用） | `ACT_GE_BYTEARRAY`（二进制数据，存 BPMN XML） |

> `flowable.database.schema-update: true` 配置让 Flowable 启动时自动创建/更新这些表。

---

## 三、Spring Boot 集成详解

### 3.1 入口类

文件：`infra/flowable-app/src/main/java/com/bpmn/demo/FlowableApplication.java`

```java
package com.bpmn.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class FlowableApplication {
    public static void main(String[] args) {
        SpringApplication.run(FlowableApplication.class, args);
    }
}
```

**极简入口**：仅一个类 + 一个注解。`@SpringBootApplication` 是三个注解的组合：

| 注解 | 作用 |
|---|---|
| `@SpringBootConfiguration` | 标记为配置类 |
| `@EnableAutoConfiguration` | 自动配置（关键！自动注册 Flowable 引擎 Bean） |
| `@ComponentScan` | 组件扫描（当前包及子包） |

**自动配置做了什么？** `flowable-spring-boot-starter` 的 `META-INF/spring.factories` 中注册了自动配置类，Spring Boot 启动时自动完成：

1. 创建 `ProcessEngine` 实例
2. 初始化 `RepositoryService`、`RuntimeService`、`TaskService`、`HistoryService` 等 Service Bean
3. 启动 REST API 端点（因为引入了 `flowable-rest`）
4. 检查数据库，执行 schema-update

### 3.2 application.yml 配置详解

文件：`infra/flowable-app/src/main/resources/application.yml`

```yaml
server:
  port: 8080                    # Flowable REST API 端口

spring:
  application:
    name: flowable-app
  datasource:
    # ── 数据源：优先环境变量，默认 H2 内存库 ──
    url: ${DB_URL:jdbc:h2:mem:flowable;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE}
    username: ${DB_USERNAME:sa}
    password: ${DB_PASSWORD:}
    driver-class-name: ${DB_DRIVER:org.h2.Driver}
  h2:
    console:
      enabled: true             # 启用 H2 Web 控制台（仅本地调试）
      path: /h2-console         # 访问 http://localhost:8080/h2-console

flowable:
  rest:
    enabled: true               # 启用 REST API 模块
  database:
    schema-update: true         # 自动创建/更新数据库表
  event-reregister: false       # 禁用事件重注册（加快启动速度）

management:
  endpoints:
    web:
      exposure:
        include: health,info    # 暴露 /actuator/health 和 /actuator/info
  endpoint:
    health:
      show-details: always      # 健康检查显示详细信息

logging:
  level:
    org.flowable: INFO          # Flowable 日志级别
    root: INFO
```

#### 3.2.1 数据源配置 —— `${}` 语法解析

```yaml
url: ${DB_URL:jdbc:h2:mem:flowable;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE}
```

语法：`${环境变量名:默认值}`

| 运行方式 | `DB_URL` 环境变量 | 实际值 |
|---|---|---|
| Docker Compose | `jdbc:mysql://mysql:3306/flowable?...` | MySQL 连接 |
| 本地 `java -jar` | 未设置 | H2 内存数据库 |

**双数据库设计的好处**：
- **Docker 模式**：MySQL 持久化，适合长期运行
- **本地模式**：H2 内存数据库，零配置启动，适合快速测试

#### 3.2.2 H2 内存数据库详解

```
jdbc:h2:mem:flowable            # 内存模式，数据库名 "flowable"
;DB_CLOSE_DELAY=-1              # 连接关闭后不删除数据库（保持数据直到 JVM 退出）
;DB_CLOSE_ON_EXIT=FALSE         # JVM 退出时不关闭数据库
```

H2 控制台启用后，可访问 `http://localhost:8080/h2-console` 查看数据库中的表：
- JDBC URL: `jdbc:h2:mem:flowable`
- Username: `sa`
- Password: （空）

#### 3.2.3 Flowable 配置项

| 配置 | 值 | 含义 |
|---|---|---|
| `flowable.rest.enabled` | `true` | 启用 REST API，注册 `/repository/*`、`/runtime/*`、`/task/*` 等端点 |
| `flowable.database.schema-update` | `true` | 启动时自动检查并创建/更新 ACT_* 表 |
| `flowable.event-reregister` | `false` | 不重新注册事件监听器，减少启动时间（约快 5-10 秒） |

#### 3.2.4 Actuator 健康检查

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info
  endpoint:
    health:
      show-details: always
```

访问 `http://localhost:8080/actuator/health`，返回：

```json
{
  "status": "UP",
  "components": {
    "diskSpace": { "status": "UP", ... },
    "flowable": { "status": "UP", ... },
    "ping": { "status": "UP" }
  }
}
```

Docker Compose 的 `healthcheck` 就是检查这个端点。

---

## 四、Maven 依赖详解

文件：`infra/flowable-app/pom.xml`

### 4.1 项目坐标与父 POM

```xml
<groupId>com.bpmn.demo</groupId>
<artifactId>flowable-app</artifactId>
<version>1.0.0</version>
<packaging>jar</packaging>

<parent>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-parent</artifactId>
  <version>3.2.5</version>
</parent>
```

**父 POM 的作用**：
- 统一管理 Spring Boot 相关依赖的版本号
- 提供默认的插件配置（编译、打包等）
- 定义 Java 版本、编码等属性

### 4.2 版本属性

```xml
<properties>
  <java.version>17</java.version>
  <flowable.version>6.8.1</flowable.version>
</properties>
```

- **Java 17**：LTS 版本，Flowable 6.8.x 最低要求 Java 11，推荐 17
- **Flowable 6.8.1**：与 Spring Boot 3.2.x 兼容的最新稳定版

### 4.3 依赖分析

```xml
<!-- 1. Flowable 核心 + Spring Boot 自动配置 -->
<dependency>
  <groupId>org.flowable</groupId>
  <artifactId>flowable-spring-boot-starter</artifactId>
  <version>${flowable.version}</version>
</dependency>

<!-- 2. Flowable REST API -->
<dependency>
  <groupId>org.flowable</groupId>
  <artifactId>flowable-rest</artifactId>
  <version>${flowable.version}</version>
</dependency>

<!-- 3. 健康检查 -->
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>

<!-- 4. MySQL 驱动 -->
<dependency>
  <groupId>com.mysql</groupId>
  <artifactId>mysql-connector-j</artifactId>
  <scope>runtime</scope>
</dependency>

<!-- 5. H2 内存数据库（本地测试） -->
<dependency>
  <groupId>com.h2database</groupId>
  <artifactId>h2</artifactId>
  <scope>runtime</scope>
</dependency>
```

**依赖关系图**：

```
flowable-spring-boot-starter
  ├── flowable-engine              # 核心引擎
  ├── flowable-spring              # Spring 集成
  ├── spring-boot-starter          # Spring Boot 基础
  ├── spring-boot-starter-jdbc     # 数据源
  └── ...

flowable-rest
  ├── flowable-engine-rest         # REST API 实现
  ├── spring-boot-starter-web      # Spring MVC（内嵌 Tomcat）
  └── jackson-databind             # JSON 序列化
```

**`scope=runtime`**：MySQL 和 H2 驱动只在运行时需要，编译时不参与。这意味着你的 Java 代码不会直接 `import` 这些驱动类，它们只是 JDBC 连接时被类加载器加载。

### 4.4 构建插件

```xml
<build>
  <plugins>
    <plugin>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-maven-plugin</artifactId>
    </plugin>
  </plugins>
</build>
```

`spring-boot-maven-plugin` 的作用：
1. `mvn package` 时打包为可执行 JAR（包含所有依赖）
2. 在 JAR 中嵌入 `MANIFEST.MF`，指定 `Main-Class`
3. 提供 `repackage` goal，将普通 JAR 转为 fat JAR

打包后的文件结构：

```
target/flowable-app-1.0.0.jar
├── BOOT-INF/
│   ├── classes/          # 编译后的 .class 文件
│   └── lib/              # 所有依赖 JAR（包含 Flowable、Spring 等）
├── org/springframework/boot/loader/   # Spring Boot 类加载器
└── META-INF/
    └── MANIFEST.MF       # Start-Class: com.bpmn.demo.FlowableApplication
```

---

## 五、Dockerfile 多阶段构建详解

文件：`infra/flowable-app/Dockerfile`

```dockerfile
# ══════════════════════════════════════
# Stage 1: 编译（使用 Maven + JDK 17）
# ══════════════════════════════════════
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

# 步骤 1：复制 pom.xml 并下载依赖
COPY pom.xml .
RUN mvn dependency:go-offline -B

# 步骤 2：复制源码并构建
COPY src ./src
RUN mvn package -DskipTests -B

# ══════════════════════════════════════
# Stage 2: 运行（仅 JRE 17，不含 JDK/Maven）
# ══════════════════════════════════════
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# 安装 curl（健康检查用）
RUN apk add --no-cache curl

# 从 build 阶段复制 JAR
COPY --from=build /app/target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### 5.1 为什么用多阶段构建？

| 对比 | 单阶段 | 多阶段 |
|---|---|---|
| 基础镜像 | `maven:3.9-eclipse-temurin-17` (~800MB) | `eclipse-temurin:17-jre-alpine` (~170MB) |
| 包含内容 | JDK + Maven + 源码 + 编译产物 | 仅 JRE + JAR |
| 最终镜像大小 | ~800MB | ~200MB |
| 安全性 | 源码和构建工具暴露在镜像中 | 仅运行时必需文件 |

### 5.2 Docker 缓存层优化

```dockerfile
COPY pom.xml .              # 第一层：pom.xml 不变时命中缓存
RUN mvn dependency:go-offline -B   # 第二层：依赖下载（最耗时，约 2-5 分钟）
COPY src ./src              # 第三层：源码变更只重建从这里开始
RUN mvn package -DskipTests -B     # 第四层：编译（约 30 秒）
```

**关键**：`pom.xml` 单独复制 + `dependency:go-offline` 作为独立层。只要 `pom.xml` 不变，依赖下载层使用缓存，大幅缩短构建时间。

**Docker 缓存命中规则**：某一层变更时，该层及所有后续层都需要重建。所以把不常变更的依赖下载放在前面。

### 5.3 命令参数解析

| 命令/参数 | 含义 |
|---|---|
| `mvn dependency:go-offline` | 预下载所有依赖到本地仓库，不编译 |
| `-B` | Batch 模式，不输出进度条（适合 CI/Docker） |
| `-DskipTests` | 跳过测试（Docker 构建中通常不做测试） |
| `apk add --no-cache curl` | Alpine 安装 curl，不保留缓存索引 |
| `COPY --from=build` | 从 build 阶段复制文件 |
| `ENTRYPOINT ["java", "-jar", "app.jar"]` | 容器启动命令（JSON 数组格式，不经过 shell） |

### 5.4 基础镜像选择

| 镜像 | 大小 | 用途 |
|---|---|---|
| `maven:3.9-eclipse-temurin-17` | ~800MB | 包含 Maven + JDK 17，用于编译 |
| `eclipse-temurin:17-jre-alpine` | ~170MB | 仅 JRE 17 + Alpine Linux，用于运行 |

**为什么选 Eclipse Temurin？** 它是 Adoptium 项目（原 AdoptOpenJDK）的发行版，社区维护，免费，是 Docker Hub 上最流行的 OpenJDK 发行版。

**为什么选 Alpine？** 基于 musl libc 和 BusyBox，镜像极小（~5MB 基础系统）。Flowable 在 Alpine 上运行无已知问题。

---

## 六、Docker Compose 编排详解

文件：`docker-compose.yml`

### 6.1 完整配置解读

```yaml
version: '3.8'

services:
  # ═══════════════════════════════════════
  # 服务 1: Flowable Spring Boot 应用
  # ═══════════════════════════════════════
  flowable:
    build:
      context: ./infra/flowable-app    # Dockerfile 所在目录
      dockerfile: Dockerfile
    image: flowable-app:latest          # 构建后的镜像名
    container_name: flowable-app
    ports:
      - "8080:8080"                     # 宿主:容器
    environment:
      # ── 数据库连接（Spring Boot 读取）──
      - DB_URL=jdbc:mysql://mysql:3306/flowable?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=UTC&allowPublicKeyRetrieval=true
      - DB_USERNAME=flowable
      - DB_PASSWORD=***
      - DB_DRIVER=com.mysql.cj.jdbc.Driver
      # ── Flowable 配置 ──
      - DB_SCHEMA_UPDATE=true
      - FLOWABLE_CHECK_ASYNC_EXECUTION_QUERIES=false
      - LOG_LEVEL=INFO
    depends_on:
      mysql:
        condition: service_healthy      # 等 MySQL 健康后才启动
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
      interval: 10s                     # 每 10 秒检查一次
      timeout: 5s                       # 5 秒超时
      retries: 10                       # 最多重试 10 次

  # ═══════════════════════════════════════
  # 服务 2: MySQL 数据库
  # ═══════════════════════════════════════
  mysql:
    image: mysql:8.0
    container_name: flowable-mysql
    environment:
      - MYSQL_ROOT_PASSWORD=***
      - MYSQL_DATABASE=flowable          # 自动创建数据库
      - MYSQL_USER=flowable
      - MYSQL_PASSWORD=***
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql       # 数据持久化到 Docker Volume
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 3s
      retries: 10
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
      - --default-authentication-plugin=mysql_native_password

# ═══════════════════════════════════════
# 数据卷
# ═══════════════════════════════════════
volumes:
  mysql_data:                           # Docker 管理的命名卷
```

### 6.2 服务依赖与启动顺序

```
启动: docker compose up -d

1. MySQL 容器启动
   └── 执行 mysqladmin ping 健康检查
       └── 通过 (约 10-20 秒)
           └── Flowable 容器启动
               └── 读取 DB_URL 环境变量
                   └── 连接 mysql:3306 (Docker 内部网络)
                       └── Flowable 执行 schema-update (创建表)
                           └── 执行 curl 健康检查
                               └── 通过 (约 30-60 秒)
                                   └── 服务就绪
```

**`depends_on` + `condition: service_healthy`**：确保 MySQL 完全就绪后 Flowable 才启动，避免连接失败。

**为什么不用 `depends_on` 不带 condition？** `depends_on` 默认只等容器启动，不等服务就绪。MySQL 容器启动后需要几秒初始化数据库，此时 Flowable 连接会失败。

### 6.3 Docker 内部网络与 DNS

Docker Compose 自动创建一个桥接网络，服务之间通过**服务名**作为主机名通信：

```
Flowable 容器 → mysql:3306    # "mysql" 是服务名，Docker DNS 解析为 MySQL 容器 IP
```

这就是 `DB_URL` 中 `mysql:3306` 而非 `localhost:3306` 的原因。

| 场景 | 主机名 |
|---|---|
| Flowable 容器内访问 MySQL | `mysql:3306` |
| 宿主机访问 MySQL | `localhost:3306` |
| 宿主机访问 Flowable | `localhost:8080` |

### 6.4 数据持久化

```yaml
volumes:
  - mysql_data:/var/lib/mysql
```

| 不用 Volume | 用 Volume |
|---|---|
| 容器删除 = 数据丢失 | 容器删除，数据保留在 Volume 中 |
| 每次重启重新初始化 | 重启后数据仍在 |

Volume 生命周期：
- `docker compose up -d`：Volume 不存在时自动创建
- `docker compose down`：默认不删除 Volume
- `docker compose down -v`：删除 Volume（慎用！数据丢失）

查看 Volume：

```bash
docker volume ls
# 可看到 bpmn_mysql_data 类似名称的卷

docker volume inspect bpmn_mysql_data
# 查看卷在宿主机上的实际路径
```

### 6.5 MySQL 字符集配置

```yaml
command:
  - --character-set-server=utf8mb4
  - --collation-server=utf8mb4_unicode_ci
  - --default-authentication-plugin=mysql_native_password
```

| 参数 | 含义 |
|---|---|
| `utf8mb4` | 真正的 UTF-8（MySQL 的 `utf8` 只有 3 字节，不支持 emoji 和部分汉字） |
| `utf8mb4_unicode_ci` | Unicode 排序规则，`ci` = Case Insensitive |
| `mysql_native_password` | 使用原生密码认证（Flowable 的 MySQL 驱动兼容性更好） |

### 6.6 健康检查机制

**MySQL 健康检查**：

```yaml
test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
interval: 5s     # 每 5 秒检查一次
timeout: 3s      # 单次检查 3 秒超时
retries: 10      # 连续 10 次失败才标记为 unhealthy
```

`mysqladmin ping` 返回 `mysqld is alive` 表示 MySQL 已就绪。

**Flowable 健康检查**：

```yaml
test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
interval: 10s
timeout: 5s
retries: 10
```

`curl -f` 表示 HTTP 状态码 >= 400 时返回非零退出码。健康检查返回 200 表示 Flowable 引擎已启动。

**为什么 Flowable 需要更长的 retries？** Flowable 启动需要：
1. Spring Boot 初始化 (~10s)
2. 连接 MySQL (~2s)
3. Flowable schema-update 创建表 (~20-40s，首次更慢)
4. REST API 端点注册 (~5s)

总计约 30-60 秒。

---

## 七、Flowable REST API 与后端交互

后端的 `FlowableRestClient` 通过 HTTP 调用 Flowable REST API。理解这个交互层是学习 infra 的关键。

### 7.1 Flowable REST API 端点总览

Flowable 启用 REST 后，默认注册以下端点组：

| 端点前缀 | 用途 | 对应 Flowable Service |
|---|---|---|
| `/repository/*` | 流程定义管理 | RepositoryService |
| `/runtime/*` | 运行时管理（实例、执行） | RuntimeService |
| `/task/*` | 任务管理 | TaskService |
| `/history/*` | 历史查询 | HistoryService |
| `/management/*` | 引擎管理 | ManagementService |
| `/identity/*` | 用户/组管理 | IdentityService |

### 7.2 认证方式

Flowable REST API 默认启用 **HTTP Basic Auth**：

```
Authorization: Basic <base64(username:password)>
```

后端的实现：

```typescript
// backend/src/services/flowableRest.ts
this.auth = Buffer.from(
  `${config.flowable.user}:${config.flowable.password}`
).toString('base64');

// 每次请求携带
headers: { Authorization: `Basic ${this.auth}` }
```

默认凭证：
- 用户名：`flowable`
- 密码：`flowable`（可在 `.env` 中修改）

> **安全提示**：Flowable REST API 没有细粒度权限控制，知道凭证的人可以操作所有流程。生产环境应通过反向代理限制访问，或自定义 Spring Security 配置。

### 7.3 本项目调用的 Flowable API 映射

```
┌──────────────────────────────────────────────────────────────────┐
│  后端 FlowableRestClient 方法         │  Flowable REST API       │
├──────────────────────────────────────────────────────────────────┤
│  deploy(xml, name)                    │  POST /repository/deployments (multipart)  │
│  listDefinitions()                    │  GET  /repository/process-definitions?latest=true │
│  getDefinition(id)                    │  GET  /repository/process-definitions/:id  │
│  startInstance(key, bizKey, vars)     │  POST /runtime/process-instances           │
│  listInstances()                      │  GET  /runtime/process-instances           │
│  getInstance(id)                      │  GET  /runtime/process-instances/:id       │
│  terminateInstance(id)                │  DELETE /runtime/process-instances/:id     │
│  listTasks(opts)                      │  GET  /task?processInstanceId=...&assignee=... │
│  completeTask(id, vars)               │  POST /task/:id/complete                   │
│  assignTask(id, assignee)             │  PUT  /task/:id/assignee                   │
│  addComment(taskId, userId, msg)      │  POST /task/:id/comment                    │
│  listComments(taskId)                 │  GET  /task/:id/comment                    │
│  getHistoricActivities(instId)        │  GET  /history/activity-instances?processInstanceId=... │
│  health()                             │  GET  /repository/deployments (探测)       │
└──────────────────────────────────────────────────────────────────┘
```

### 7.4 关键 API 调用示例

#### 部署流程（最特殊 —— multipart/form-data）

```
POST /repository/deployments
Content-Type: multipart/form-data

filesToDeploy: process.bpmn (BPMN XML 文件)
```

后端实现：

```typescript
const fd = new FormData();
fd.append('filesToDeploy', new Blob([xml], { type: 'text/xml' }), 'process.bpmn');

const resp = await fetch(`${this.baseUrl}/repository/deployments`, {
  method: 'POST',
  headers: { Authorization: `Basic ${this.auth}` },
  body: fd,   // 不设 Content-Type，浏览器/Node 自动设 boundary
});
```

**为什么用 multipart？** Flowable 的部署接口支持同时上传多个文件（BPMN XML + DMN 决策表 + 表单定义），所以用 `multipart/form-data`。

#### 启动流程实例

```
POST /runtime/process-instances
Content-Type: application/json

{
  "definitionKey": "leave_request",
  "businessKey": "LEAVE-001",
  "variables": {
    "reason": { "value": "病假", "type": "string" },
    "days": { "value": 3, "type": "integer" }
  }
}
```

> **注意**：Flowable 的变量格式是 `{ "value": ..., "type": "string|integer|boolean|..." }`。本项目在中间层做了简化，前端传 `{ "reason": "病假" }`，后端直接透传给 Flowable（大部分情况下 Flowable 也能自动推断类型）。

#### 完成任务

```
POST /task/:taskId/complete
Content-Type: application/json

{
  "variables": {
    "approved": { "value": true, "type": "boolean" }
  }
}
```

完成任务后，Flowable 引擎自动推进流程：
1. 如果下一个节点是 `userTask`，创建新任务
2. 如果是 `exclusiveGateway`，计算条件表达式，选择分支
3. 如果是 `endEvent`，结束流程实例

---

## 八、完整启动流程与排错

### 8.1 启动命令

```bash
# 构建并启动（首次较慢，需要下载依赖和构建 Docker 镜像）
docker compose up -d

# 查看状态
docker compose ps

# 预期输出：
# NAME             STATUS          PORTS
# flowable-app     Up (healthy)    0.0.0.0:8080->8080/tcp
# flowable-mysql   Up (healthy)    0.0.0.0:3306->3306/tcp
```

### 8.2 启动时间线

```
0s      docker compose up -d
3s      MySQL 容器启动
15s     MySQL 健康检查通过
18s     Flowable 容器启动
20s     Spring Boot 开始初始化
25s     连接 MySQL 成功
30s     Flowable schema-update 开始（首次：创建 40+ 张表）
60s     REST API 端点注册完成
70s     健康检查通过 → 服务就绪
```

### 8.3 常见问题排错

#### Q1: Flowable 容器一直 Restarting

```bash
docker compose logs flowable
```

常见原因：
- `DB_URL` 配置错误（检查 `mysql:3306` 主机名是否正确）
- MySQL 尚未就绪（`depends_on: condition: service_healthy` 应该能避免，但网络问题可能导致）
- 密码不匹配（`DB_PASSWORD` 与 `MYSQL_PASSWORD` 不一致）

#### Q2: 健康检查一直失败

```bash
# 手动检查
docker compose exec flowable curl -f http://localhost:8080/actuator/health

# 如果连接拒绝，说明 Spring Boot 尚未启动完成
# 如果返回 503，说明 Flowable 引擎初始化中
```

#### Q3: 后端连接 Flowable 失败

```bash
# 1. 确认 Flowable 已健康
curl http://localhost:8080/actuator/health

# 2. 确认 .env 配置
# MODE=flowable
# FLOWABLE_URL=http://localhost:8080

# 3. 确认后端已重启（修改 .env 后需要重启）
```

#### Q4: MySQL 字符集问题

如果 Flowable 日志中出现乱码或字符集错误：

```bash
# 进入 MySQL 容器检查
docker compose exec mysql mysql -uflowable -p -e "SHOW VARIABLES LIKE 'character_set%'"

# 确认 character_set_server = utf8mb4
```

#### Q5: 端口冲突

```bash
# 检查 8080 端口占用
lsof -i :8080     # macOS/Linux
netstat -ano | findstr :8080   # Windows

# 修改端口：修改 docker-compose.yml 的 ports 和 application.yml 的 server.port
```

### 8.4 停止与清理

```bash
# 停止容器（保留数据）
docker compose down

# 停止容器并删除数据卷（完全清理）
docker compose down -v

# 重新构建（代码变更后）
docker compose up -d --build
```

---

## 九、Flowable 管理界面

Flowable 启用 REST 后，自带一个简单的 Web 管理界面：

**访问**：`http://localhost:8080`

默认页面会展示 Flowable 的 REST API 文档或重定向到管理界面（取决于版本配置）。

**常用管理端点**：

| 端点 | 用途 |
|---|---|
| `/actuator/health` | 健康检查 |
| `/actuator/info` | 引擎信息 |
| `/repository/deployments` | 查看所有部署 |
| `/repository/process-definitions` | 查看所有流程定义 |
| `/runtime/process-instances` | 查看运行中实例 |
| `/task` | 查看所有任务 |
| `/h2-console` | H2 数据库控制台（仅 H2 模式） |

> **提示**：生产环境建议通过 Nginx 反向代理限制 `/actuator` 和 `/h2-console` 的访问。

---

## 十、H2 本地调试模式

不使用 Docker，直接运行 Flowable JAR：

```bash
# 1. 编译
cd infra/flowable-app
mvn package -DskipTests

# 2. 运行（使用默认 H2 内存数据库）
java -jar target/flowable-app-1.0.0.jar

# 3. 访问
# REST API: http://localhost:8080
# H2 控制台: http://localhost:8080/h2-console
```

**H2 控制台使用**：

1. 打开 `http://localhost:8080/h2-console`
2. 填写连接信息：
   - JDBC URL: `jdbc:h2:mem:flowable`
   - Username: `sa`
   - Password: （空）
3. 点击 Connect
4. 可以查看所有 `ACT_*` 表，手动查询数据

**常用 SQL**：

```sql
-- 查看所有流程定义
SELECT * FROM ACT_RE_PROCDEF;

-- 查看所有运行中实例
SELECT * FROM ACT_RU_EXECUTION;

-- 查看所有待办任务
SELECT * FROM ACT_RU_TASK;

-- 查看历史活动
SELECT * FROM ACT_HI_ACTINST ORDER BY START_TIME DESC;
```

---

## 十一、环境变量传递链

从 `.env` 到 Flowable 的完整传递路径：

```
backend/.env                    docker-compose.yml
┌──────────────────┐           ┌─────────────────────────┐
│ MODE=flowable    │           │ environment:            │
│ FLOWABLE_URL=... │           │   - DB_URL=jdbc:mysql...│
│ FLOWABLE_USER=.. │           │   - DB_USERNAME=flowable │
│ FLOWABLE_PASSWORD│           │   - DB_PASSWORD=***      │
│ DB_URL=...       │           │   - DB_DRIVER=com.mysql..│
│ DB_USERNAME=..   │           └──────────┬──────────────┘
│ DB_PASSWORD=..   │                      │
└────────┬─────────┘                      ▼
         │                    Spring Boot 容器启动
         │                    读取环境变量 → application.yml ${DB_URL:默认值}
         │
         ▼
后端 Node.js 启动
读取 .env → config.ts
  ├── config.flowable.url → FlowableRestClient 连接 http://localhost:8080
  └── config.db.* → 仅记录，后端不直连 MySQL
```

**关键理解**：
- 后端 Node.js 只通过 HTTP 连接 Flowable（`FLOWABLE_URL`），不直连 MySQL
- `DB_URL` 环境变量在 Docker Compose 中传给 Flowable 容器，Flowable 用它连接 MySQL
- `.env` 中的 `DB_*` 变量是给 `docker-compose.yml` 参考的，后端本身不用

---

## 十二、核心设计模式

### 12.1 基础设施即代码（Infrastructure as Code）

整个 Flowable + MySQL 的部署通过 `docker-compose.yml` + `Dockerfile` + `application.yml` 定义，版本化管理，可重复构建。

### 12.2 配置外部化

`application.yml` 中的 `${DB_URL:默认值}` 语法让配置可以在不修改代码的情况下通过环境变量覆盖，符合 [12-Factor App](https://12factor.net/zh_cn/) 原则。

### 12.3 健康检查链

```
MySQL: mysqladmin ping → healthy
  └── Flowable: curl /actuator/health → healthy
        └── 后端: GET /api/health → healthy
              └── 前端: Header 指示灯
```

每一层都提供健康检查，问题可以快速定位到具体层级。

### 12.4 多阶段构建（Multi-stage Build）

Dockerfile 将编译环境和运行环境分离，最小化最终镜像。

### 12.5 依赖启动顺序

`depends_on: condition: service_healthy` 确保服务按正确顺序启动。

---

## 十三、扩展思路

### 13.1 添加 Redis 缓存

```yaml
# docker-compose.yml
redis:
  image: redis:7-alpine
  ports: ["6379:6379"]
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
```

后端可以缓存流程定义列表和任务列表，减少对 Flowable 的请求。

### 13.2 添加 Nginx 反向代理

```yaml
nginx:
  image: nginx:alpine
  ports: ["80:80"]
  volumes:
    - ./nginx.conf:/etc/nginx/nginx.conf
  depends_on:
    - flowable
```

统一入口：`/` → 前端，`/api` → Node.js 后端，`/flowable` → Flowable（可选暴露）。

### 13.3 添加自定义 Java Service Task

在 `FlowableApplication.java` 同级创建：

```java
@Component
public class NotifyServiceTask implements JavaDelegate {
    @Override
    public void execute(DelegateExecution execution) {
        String assignee = (String) execution.getVariable("assignee");
        // 发送通知邮件等
    }
}
```

BPMN XML 中引用：

```xml
<bpmn:serviceTask id="Task_Notify" name="发送通知"
  flowable:delegateExpression="${notifyServiceTask}" />
```

### 13.4 使用 Flowable IDM 管理用户

添加依赖：

```xml
<dependency>
  <groupId>org.flowable</groupId>
  <artifactId>flowable-idm-spring-boot-starter</artifactId>
</dependency>
```

可以通过 `/identity/users` 和 `/identity/groups` 管理用户和组。

### 13.5 升级到 Flowable 7.x

Flowable 7.x 主要变化：
- 支持 Spring Boot 3.x + Java 17+
- 新增 CMMN 和 App 引擎
- REST API 结构有调整

升级需要修改 `pom.xml` 中的 `flowable.version` 和 `spring-boot-starter-parent` 版本。

---

## 十四、推荐学习路径

```
1.  docker-compose.yml               → 理解整体编排结构
2.  infra/flowable-app/Dockerfile     → 理解多阶段构建
3.  application.yml                   → 理解 Spring Boot + Flowable 配置
4.  pom.xml                           → 理解 Maven 依赖和版本管理
5.  FlowableApplication.java          → 理解 Spring Boot 自动配置
6.  backend/src/services/flowableRest.ts → 理解如何调用 Flowable REST API
7.  docker compose up -d              → 实际启动，观察日志
8.  访问 /actuator/health             → 理解健康检查
9.  用 curl 调用 Flowable REST API     → 理解 API 结构
10. 连接 H2/MySQL 查看表结构           → 理解 Flowable 数据模型
```
