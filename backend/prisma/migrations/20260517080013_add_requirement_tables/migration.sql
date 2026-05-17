-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "coursesNeeded" INTEGER NOT NULL DEFAULT 1,
    "creditsRequired" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementCourse" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "courseId" TEXT,
    "courseCode" TEXT NOT NULL,

    CONSTRAINT "RequirementCourse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_slug_key" ON "Requirement"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementCourse_requirementId_courseCode_key" ON "RequirementCourse"("requirementId", "courseCode");

-- AddForeignKey
ALTER TABLE "RequirementCourse" ADD CONSTRAINT "RequirementCourse_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementCourse" ADD CONSTRAINT "RequirementCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
