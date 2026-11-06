# ECE 1724 Project Proposal

**Team members:** Huiying Yu(1012487667), Carla Pan(1005884884), Xiyue Wang (1001093791)

## **1\. Motivation**

### **1.1 Problem and context**

Learning management systems such as Quercus provide essential course management tools, but accessing information can involve unnecessary navigation. Based on our experience, announcements are often displayed as lists of titles, requiring students to open individual posts to view details. Course homepages also do not always provide a unified overview of recent announcements, upcoming assessments, and learning materials.

Finding information within lengthy PDFs presents another challenge, as students must often search multiple documents individually. Student-created notes and supplementary resources may also be scattered across different channels, making useful materials difficult to discover.

LearnFlow addresses these limitations through a centralized dashboard, quick information previews, and searchable learning resources.

### **1.2 Intended Users and Stakeholders**

LearnFlow primarily targets two user groups:

* **Students:** Need convenient access to course updates, quizzes, and searchable learning materials, as well as opportunities to share notes and discover resources contributed by peers.  
* **Instructors:** Need tools to organize courses, publish announcements, distribute learning materials, create quizzes, and monitor student assessments.

### **1.3 Why the Problem Matters**

Fragmented course information can increase repetitive navigation and make important updates harder to identify. By consolidating course activities and enabling PDF content search, LearnFlow aims to reduce the effort required to find relevant information. Student resource sharing further encourages peer learning and makes useful materials more accessible. Together, these features aim to create a more organized and efficient learning experience.

## **2\. Objectives, Architecture, and Key Features**

### **2.1 Project objectives and core functionality**

LearnFlow builds a centralized learning platform that improves how students and instructors access, organize, and share course information. Its main objectives are reducing unnecessary navigation and improving learning resources accessibility. The platform will provide the following core functionalities:

* **Centralized Dashboard:** Summarizes recent activities, allowing users to access important course information without navigating through multiple pages.  
* **Searchable PDF Resources:** Enables students to search keywords across uploaded documents without examining individual files.  
* **Online Quizzes:** Allows instructors to create quizzes and students to complete assessments through the platform.  
* **Shared Note Repository:** Allows students to contribute learning materials, discover resources shared by others, supporting collaborative learning.  
* **Course Management:** Enables instructors to manage courses, publish announcements, upload learning resources, create assessments, and view active assessment submission rate.  
* **System Administration**: Dedicated page for administrators to manage courses, users, and course enrollments.

### **2.2 Application architecture**

LearnFlow will use a separate React frontend and Express backend, both developed with TypeScript and communicating through RESTful APIs. The frontend will handle user interactions, while the backend will manage authentication, application logic, file processing, and database operations. Although this separation adds structural complexity,it allows independent development, easier task distribution among team members, and future extensibility.

**Frontend Architecture and User Interface**

The frontend will use React with TypeScript to build reusable components, including navigation bars, announcement cards, and resource previews. TypeScript provides static type checking, helping reduce errors when handling application data and communicating with backend APIs.

Tailwind CSS will be used for styling and responsive layouts, while shadcn/ui will provide reusable interface elements. These technologies ensure consistent design and reduce development effort.

After login, the user will see a course selection page. After selecting a course, students will be directed to its homepage, which displays recent announcements, upcoming assessments, and newly uploaded materials. A navigation bar will provide tabs for accessing different sections, including Resources, Assessments, and Announcements. The Announcements page will present posts in a vertically scrollable feed, while Resources page will provide keyword search across PDFs, resource browsing, document previews, and student note uploads.

Instructors will have additional controls to publish announcements, create assessments, manage resources and visibility, and review submissions.

System administrators will have a separate interface for managing users and courses, including enrollment and role assignment. Archived courses will remain accessible only to administrators in read-only mode.

**Backend Architecture and Database Design**

The backend will use Express.js and TypeScript to implement RESTful APIs. Express will route HTTP requests to controllers that execute business logic and return JSON responses. For example, opening a course homepage will trigger requests for announcements, assessments, and resources, which the backend retrieves from PostgreSQL.

PostgreSQL will use a single database with separate schemas for course-specific data. This provides logical isolation without the overhead of maintaining independent databases.

The shared schema will contain Users, Courses, Enrollments, and ExtractionJobs. Courses will store course information, status, and schema references. Enrollments will associate users with courses and their roles, while ExtractionJobs will track pending PDF processing tasks.

Each course schema will contain tables for Announcements, Assignments, Quizzes, QuizQuestions, Submissions, LearningResources, and ResourcePages. LearningResources will store both instructor materials and student notes, distinguished by ownership and resource type. ResourcePages will store extracted PDF text by page to support course-specific keyword searches.

The backend will validate authenticated sessions, course membership, role permissions, and resource ownership before accessing course data, preventing unauthorized operations even when API endpoints are called directly. A background worker thread will process pending extraction jobs without blocking normal API requests.

**Cloud Storage**

AWS S3 will store original PDFs, including lecture materials, student-created notes, and uploaded assignments. PostgreSQL will maintain file metadata, ownership, storage references, extraction status, and searchable text. 

When users upload PDFs, the backend will verify upload permissions and validate the file before storing it in S3. The background worker will temporarily download the file, extract its text, and store the results in ResourcePages. For previews and downloads, the backend will generate temporary presigned URLs for direct S3 access.

S3 will also store quiz submissions compiled by the backend into files containing question IDs and answers. When viewing results, the application will retrieve these files and combine the answers with their corresponding questions for display.

Overall, this architecture combines React, Express, TypeScript, Tailwind CSS, shadcn/ui, PostgreSQL, and cloud storage to build a maintainable learning platform. It contains a manageable infrastructure while supporting LearnFlow's core functionality and advanced features.

### **2.3 Advanced Features**

LearnFlow will implement two advanced features: Authentication and Authorization and File Processing.

**Authentication and Authorization**

The platform will support secure user authentication and role-based access control, distinguishing between system administrators and regular users, with course-specific roles for instructors, and students. System administrators will manage courses and user assignments through designated administrative functions. Instructors will be authorized to publish announcements, upload resources, and create quizzes, while students can access enrolled courses, complete assessments, and upload or share their own learning materials. The backend will enforce role-specific permissions, course membership restrictions, and resource ownership checks to prevent unauthorized access or modification.

**File Processing**

LearnFlow will implement PDF text extraction and content-based search to improve access to learning materials. Both instructors and students will be able to upload PDF documents, including lecture materials and student-created notes. Original files will be stored in cloud object storage such as AWS S3, while the backend will extract searchable text and associate it with the corresponding file records.

Through the Learning Resources page, users will be able to search for keywords within PDF contents across instructor-provided materials and student-shared resources. Matching documents will be displayed as search results, allowing users to open or download relevant files. This functionality extends beyond basic file storage by processing document contents to support efficient information retrieval and knowledge sharing.

### **2.4 Scope and feasibility**

To ensure feasibility within the course timeline, LearnFlow will prioritize authentication, course management, a centralized dashboard, basic quizzes (common question types, draft saving, submissions, and grading), and learning resource sharing with keyword-based PDF search.

Both instructors and students will be able to upload and share materials. Advanced features such as AI-generated questions, OCR, and collaborative PDF editing will be excluded from the initial scope. By using established frameworks and libraries, the team will focus on reliable integration and core functionality, with email notifications considered only if time permits.

## **3\. Project Plan and Team Responsibilities**

### **3.1 Team Responsibilities**

The project will be divided into three primary development areas, with each member responsible for specific features and deliverables.

* **Member 1 — Frontend and User Interface:** Develop the React frontend using TypeScript, Tailwind CSS, and shadcn/ui. Implement course selection, dashboards, announcements, quiz interfaces, shared notes, and administration pages. Integrate frontend components with backend APIs and implement role-specific user interfaces.  
* **Member 2 — Backend and Database:** Design and manage the PostgreSQL shared and course-specific schemas. Develop Express RESTful APIs for course management, announcements, quizzes, submissions, and course-specific PDF search. Implement database operations and ensure data integrity.  
* **Member 3 — Authentication, Authorization, and File Processing:** Implement user authentication, session management, and role-based access control for administrators, instructors, and students. Integrate AWS S3 for file storage and implement PDF uploads, background text extraction, and processing status management.

All members will collaborate on API design, integration testing, debugging, deployment, and documentation.

### **3.2 Development Timeline**

| Period | Key Tasks and Deliverables |
| ----- | ----- |
| **Nov 9–15** | Set up the GitHub repository, React and Express projects, PostgreSQL schemas, and shared API contracts. Implement initial authentication, authorization middleware, and core course management APIs. |
| **Nov 16–22** | Develop dashboards, announcements, quiz interfaces, and core backend APIs. Implement S3 integration, PDF uploads, and initial text extraction. Begin frontend-backend integration. |
| **Nov 23–29** | Complete and integrate core quiz, PDF search, and resource-sharing workflows by Nov 26 for the presentation. Use the remaining days for testing, bug fixes, and improvements. |
| **Nov 30–Dec 6** | Conduct end-to-end testing, resolve integration issues, finalize deployment, and prepare the README, AI session documentation, and demonstration video for final submission. |

### **3.3 Integration and Risk Management**

The team will establish REST API contracts and shared TypeScript interfaces early to support parallel development. Members will work on separate GitHub branches, use pull requests for code review, and integrate features incrementally throughout development.

Key risks include inconsistent API interfaces, authorization errors, maintenance of course-specific database schemas, and delays in PDF processing. To address these risks, the team will conduct early integration testing, coordinate database schema changes, enforce authentication and authorization checks on protected endpoints, and track PDF extraction status. If time becomes limited, optional features such as email notifications will be postponed to prioritize reliable core functionality.

## **4\. Initial Team Reasoning and AI-Assisted Exploration**

### **4.1 Initial Team Reasoning**

**Problem Framing:** Our team identified that learning management systems like Quercus require excessive navigation to access announcements, assessments, and resources. Searching lengthy PDFs is also inefficient. We envisioned a centralized platform providing course updates, quizzes, searchable resources, and student note sharing.

**Initial Technical Hypotheses:** We considered React for the frontend, a backend service for application logic, and a relational database for course information. We also explored storing PDFs separately and extracting their text to enable keyword searches.

**Open Questions:** A major uncertainty was database schema complexity. We initially considered separate schemas for individual courses but were uncertain whether this approach would be more maintainable than shared tables while supporting efficient course-specific queries. We also questioned how to manage relationships among users, enrollments, quizzes, submissions, and resources without excessive complexity. Other concerns included implementing role-based permissions, integrating PDF processing with cloud storage, and completing all core features within the project timeline.

### **4.2 Exploration and Evaluation**

Our team initially proposed using separate PostgreSQL schemas for each course to organize course-specific data. During AI-assisted exploration, AI suggested an alternative approach: using shared tables with `course_id` filtering to simplify database maintenance and schema updates.

We evaluated both approaches based on query complexity, data organization, and maintainability. While shared tables would simplify migrations, separate schemas provide clearer logical separation between courses. Since LearnFlow's dashboard and PDF search operate within individual courses, we decided to retain our original separate-schema design, despite the additional maintenance required for schema updates.

This decision demonstrates how we critically evaluated AI suggestions against our project requirements rather than adopting them directly.