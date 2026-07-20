-- AlterTable
ALTER TABLE "DepartmentHead" ADD COLUMN     "restrictedCategoryId" TEXT;

-- AddForeignKey
ALTER TABLE "DepartmentHead" ADD CONSTRAINT "DepartmentHead_restrictedCategoryId_fkey" FOREIGN KEY ("restrictedCategoryId") REFERENCES "AccountsCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
