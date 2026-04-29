-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "courseNumber" TEXT NOT NULL,
    "subjectCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "longName" TEXT,
    "description" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "department" TEXT NOT NULL,
    "career" TEXT NOT NULL DEFAULT 'Undergraduate',
    "componentsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prerequisite" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "prereqCourseId" TEXT,
    "prereqCode" TEXT NOT NULL,

    CONSTRAINT "Prerequisite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Professor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "rmpId" TEXT,
    "avgRating" DOUBLE PRECISION,
    "avgDifficulty" DOUBLE PRECISION,
    "wouldTakeAgain" DOUBLE PRECISION,
    "numRatings" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Professor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Prerequisite_courseId_prereqCode_key" ON "Prerequisite"("courseId", "prereqCode");

-- CreateIndex
CREATE UNIQUE INDEX "Professor_rmpId_key" ON "Professor"("rmpId");

-- AddForeignKey
ALTER TABLE "Prerequisite" ADD CONSTRAINT "Prerequisite_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prerequisite" ADD CONSTRAINT "Prerequisite_prereqCourseId_fkey" FOREIGN KEY ("prereqCourseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;
