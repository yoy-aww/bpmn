# Flowable Spring Boot Application
# 多阶段构建：先编译，再运行

# Stage 1: Build
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

# 复制 pom.xml 并先下载依赖（利用 Docker 缓存）
COPY pom.xml .
RUN mvn dependency:go-offline -B

# 复制源码并构建
COPY src ./src
RUN mvn package -DskipTests -B

# Stage 2: Run
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# 安装 curl (健康检查用)
RUN apk add --no-cache curl

# 复制构建产物
COPY --from=build /app/target/*.jar app.jar

# 暴露端口
EXPOSE 8080

# 启动
ENTRYPOINT ["java", "-jar", "app.jar"]
