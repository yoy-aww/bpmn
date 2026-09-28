package com.bpmn.demo;

import org.flowable.spring.boot.RestApiAutoConfiguration;
import org.flowable.spring.boot.process.ProcessEngineRestConfiguration;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

@Configuration
@Import({RestApiAutoConfiguration.class, ProcessEngineRestConfiguration.class})
@ComponentScan(basePackages = {"org.flowable.rest.service.api"})
public class RestApiConfiguration {
}
