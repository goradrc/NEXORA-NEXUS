export function Injectable(): ClassDecorator {
  return () => {};
}

export class BadRequestException extends Error {
  readonly status = 400;
  constructor(message = 'Bad Request') {
    super(message);
    this.name = 'BadRequestException';
  }
}

export class UnauthorizedException extends Error {
  readonly status = 401;
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedException';
  }
}

export class ForbiddenException extends Error {
  readonly status = 403;
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenException';
  }
}

export class NotFoundException extends Error {
  readonly status = 404;
  constructor(message = 'Not Found') {
    super(message);
    this.name = 'NotFoundException';
  }
}

export class ConflictException extends Error {
  readonly status = 409;
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'ConflictException';
  }
}
