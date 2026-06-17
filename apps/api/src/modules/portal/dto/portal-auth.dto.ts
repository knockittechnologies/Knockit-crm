import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class PortalLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

export class PortalAcceptInviteDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(10)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain upper, lower case letters and a number',
  })
  password: string;
}

export class PortalRefreshTokenDto {
  @IsString()
  refreshToken: string;
}
