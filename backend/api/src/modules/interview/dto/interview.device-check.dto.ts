import { IsBoolean } from "class-validator";

export class DeviceCheckDto {
  @IsBoolean()
  cameraGranted!: boolean;

  @IsBoolean()
  microphoneGranted!: boolean;

  @IsBoolean()
  networkStable!: boolean;
}
