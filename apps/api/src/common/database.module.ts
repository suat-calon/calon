import { Global, Module } from '@nestjs/common';
import { PrismaService }  from './prisma.service';

/**
 * Global olarak register edilir — her modülde ayrıca import gerekmez.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports:   [PrismaService],
})
export class DatabaseModule {}
