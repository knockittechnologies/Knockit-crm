import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  Matches,
  Length,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  totpCode?: string; // required only if user has 2FA enabled
}

export class RegisterTenantDto {
  // Used for the very first signup that creates a new tenant + its first
  // super-admin user. Subsequent users are invited, not registered.
  @IsString()
  @MinLength(2)
  companyName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters' })
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain upper, lower case letters and a number',
  })
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;
}

export class EnableTwoFaDto {
  @IsString()
  @Length(6, 6)
  totpCode: string; // confirms the user scanned the QR code correctly
}

export class VerifyTwoFaDto {
  @IsString()
  @Length(6, 6)
  totpCode: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(10)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain upper, lower case letters and a number',
  })
  newPassword: string;
}

export class AcceptInviteDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(10)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain upper, lower case letters and a number',
  })
  password: string;
}
