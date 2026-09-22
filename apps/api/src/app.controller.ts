import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  root() {
    return {
      status: "ok",
      service: "antara-erp-api",
      timestamp: new Date().toISOString(),
    };
  }
}


