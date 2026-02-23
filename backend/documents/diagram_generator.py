"""
Diagram Generator - Creates various Mermaid diagrams from document content
Supports: flowchart, sequence, entity-relationship, state diagrams
"""
from typing import Dict, Any, Literal
from utils.gemini_client import gemini_client
from utils.logger import logger
DiagramType = Literal["flowchart", "sequence", "er", "state", "class"]

class DiagramGenerator:
    """Generate various Mermaid diagrams from document content"""

    def __init__(self):
        self.gemini_client = gemini_client

    def generate_diagram(
        self,
        content: str,
        title: str = "Document",
        diagram_type: DiagramType = "flowchart"
    ) -> Dict[str, Any]:
        """
        Generate a Mermaid diagram from document content.

        Args:
            content: Document text content
            title: Document title
            diagram_type: Type of diagram to generate

        Returns:
            Dict with mermaid code and metadata
        """
        generators = {
            "flowchart": self._generate_flowchart,
            "sequence": self._generate_sequence,
            "er": self._generate_er_diagram,
            "state": self._generate_state_diagram,
            "class": self._generate_class_diagram,
        }

        generator = generators.get(diagram_type, self._generate_flowchart)
        return generator(content, title)

    def _generate_flowchart(self, content: str, title: str) -> Dict[str, Any]:
        """Generate a flowchart diagram showing process/workflow"""
        try:
            logger.info(f"Generating flowchart for: {title}")
            content = self._truncate_content(content)

            prompt = f"""Analyze this document and create a Mermaid FLOWCHART diagram showing the main processes, workflows, or logical flow of concepts.

DOCUMENT TITLE: {title}

MERMAID FLOWCHART SYNTAX RULES (CRITICAL):
1. Start with: graph TB (top-bottom) or graph LR (left-right)
2. Node IDs must be simple alphanumeric (no spaces): A, B, node1, step2
3. Labels with spaces MUST use quotes: A["Label with spaces"]
4. Arrow syntax: A --> B (solid), A -.-> B (dotted), A ==> B (thick)
5. Arrow labels: A -->|"label text"| B
6. Diamond for decisions: D{{"Decision?"}}
7. Rounded rectangle: R(["Rounded"])
8. Stadium shape: S([Stadium])
9. Keep labels SHORT (max 5 words)
10. Use subgraphs for grouping: subgraph "Title"

EXAMPLE:
graph TB
    A["Start Process"] --> B["Input Data"]
    B --> C{{"Valid?"}}
    C -->|"Yes"| D["Process Data"]
    C -->|"No"| E["Error Handler"]
    D --> F["Output Results"]
    E --> B

    subgraph "Processing"
        D
    end

DOCUMENT CONTENT:
{content}

Generate ONLY valid Mermaid flowchart code. No explanations, no markdown blocks."""

            mermaid_code = self.gemini_client.generate_text(prompt, temperature=0.3)
            mermaid_code = self._clean_code(mermaid_code, "graph")

            return {
                "success": True,
                "mermaid_code": mermaid_code,
                "title": title,
                "diagram_type": "flowchart"
            }
        except Exception as e:
            logger.error(f"Flowchart generation error: {e}")
            return self._get_fallback("flowchart", title, str(e))

    def _generate_sequence(self, content: str, title: str) -> Dict[str, Any]:
        """Generate a sequence diagram showing interactions"""
        try:
            logger.info(f"Generating sequence diagram for: {title}")
            content = self._truncate_content(content)

            prompt = f"""Analyze this document and create a Mermaid SEQUENCE diagram showing interactions between entities, components, or actors.

DOCUMENT TITLE: {title}

MERMAID SEQUENCE SYNTAX RULES (CRITICAL):
1. Start with: sequenceDiagram
2. Define participants: participant A as "Actor Name"
3. Arrows: A->>B: Message (solid), A-->>B: Response (dotted)
4. Activations: activate A / deactivate A
5. Notes: Note over A,B: Text here
6. Alt blocks: alt Condition / else / end
7. Loops: loop Description / end
8. Keep messages SHORT and clear
9. Use autonumber for numbered steps

EXAMPLE:
sequenceDiagram
    autonumber
    participant U as User
    participant S as Server
    participant DB as Database

    U->>S: Send Request
    activate S
    S->>DB: Query Data
    activate DB
    DB-->>S: Return Results
    deactivate DB
    S-->>U: Send Response
    deactivate S

    Note over U,S: Process complete

DOCUMENT CONTENT:
{content}

Generate ONLY valid Mermaid sequence diagram code. No explanations, no markdown blocks."""

            mermaid_code = self.gemini_client.generate_text(prompt, temperature=0.3)
            mermaid_code = self._clean_code(mermaid_code, "sequenceDiagram")

            return {
                "success": True,
                "mermaid_code": mermaid_code,
                "title": title,
                "diagram_type": "sequence"
            }
        except Exception as e:
            logger.error(f"Sequence diagram generation error: {e}")
            return self._get_fallback("sequence", title, str(e))

    def _generate_er_diagram(self, content: str, title: str) -> Dict[str, Any]:
        """Generate an entity-relationship diagram"""
        try:
            logger.info(f"Generating ER diagram for: {title}")
            content = self._truncate_content(content)

            prompt = f"""Analyze this document and create a Mermaid ER (Entity-Relationship) diagram showing entities and their relationships.

DOCUMENT TITLE: {title}

MERMAID ER SYNTAX RULES (CRITICAL):
1. Start with: erDiagram
2. Entity format: ENTITY_NAME {{ type attribute_name }}
3. Relationship: ENTITY1 ||--o{{ ENTITY2 : "relationship"
4. Cardinality symbols:
   - ||--|| one to one
   - ||--o{{ one to many
   - o{{--o{{ many to many
   - |o--o| zero or one to zero or one
5. Entity names: UPPERCASE, no spaces (use underscores)
6. Attribute types: string, int, boolean, date
7. Keep it focused on main entities (5-8 max)

EXAMPLE:
erDiagram
    USER {{
        int id PK
        string name
        string email
        date created_at
    }}
    DOCUMENT {{
        int id PK
        int user_id FK
        string title
        string content
    }}
    QUIZ {{
        int id PK
        int document_id FK
        string title
        int score
    }}

    USER ||--o{{ DOCUMENT : "uploads"
    DOCUMENT ||--o{{ QUIZ : "generates"
    USER ||--o{{ QUIZ : "takes"

DOCUMENT CONTENT:
{content}

Generate ONLY valid Mermaid ER diagram code. No explanations, no markdown blocks."""

            mermaid_code = self.gemini_client.generate_text(prompt, temperature=0.3)
            mermaid_code = self._clean_code(mermaid_code, "erDiagram")

            return {
                "success": True,
                "mermaid_code": mermaid_code,
                "title": title,
                "diagram_type": "er"
            }
        except Exception as e:
            logger.error(f"ER diagram generation error: {e}")
            return self._get_fallback("er", title, str(e))

    def _generate_state_diagram(self, content: str, title: str) -> Dict[str, Any]:
        """Generate a state diagram showing states and transitions"""
        try:
            logger.info(f"Generating state diagram for: {title}")
            content = self._truncate_content(content)

            prompt = f"""Analyze this document and create a Mermaid STATE diagram showing states and transitions of a process or system.

DOCUMENT TITLE: {title}

MERMAID STATE SYNTAX RULES (CRITICAL):
1. Start with: stateDiagram-v2
2. Initial state: [*] --> FirstState
3. Final state: LastState --> [*]
4. Transitions: State1 --> State2
5. Transition labels: State1 --> State2: action
6. Composite states: state "Name" as alias {{ ... }}
7. Notes: note right of State: Text
8. Choices: state choice <<choice>>
9. Keep state names simple (no special chars)

EXAMPLE:
stateDiagram-v2
    [*] --> Idle

    Idle --> Processing: Start
    Processing --> Validating: Process Complete

    state Validating {{
        [*] --> Checking
        Checking --> Verified: Pass
        Checking --> Failed: Fail
        Verified --> [*]
    }}

    Validating --> Complete: Valid
    Validating --> Error: Invalid

    Complete --> [*]
    Error --> Idle: Retry

    note right of Processing: Main work happens here

DOCUMENT CONTENT:
{content}

Generate ONLY valid Mermaid state diagram code. No explanations, no markdown blocks."""

            mermaid_code = self.gemini_client.generate_text(prompt, temperature=0.3)
            mermaid_code = self._clean_code(mermaid_code, "stateDiagram")

            return {
                "success": True,
                "mermaid_code": mermaid_code,
                "title": title,
                "diagram_type": "state"
            }
        except Exception as e:
            logger.error(f"State diagram generation error: {e}")
            return self._get_fallback("state", title, str(e))

    def _generate_class_diagram(self, content: str, title: str) -> Dict[str, Any]:
        """Generate a class diagram showing structure/hierarchy"""
        try:
            logger.info(f"Generating class diagram for: {title}")
            content = self._truncate_content(content)

            prompt = f"""Analyze this document and create a Mermaid CLASS diagram showing concepts, their properties, and relationships.

DOCUMENT TITLE: {title}

MERMAID CLASS SYNTAX RULES (CRITICAL):
1. Start with: classDiagram
2. Class definition: class ClassName
3. Attributes: ClassName : +attribute type
4. Methods: ClassName : +method() returnType
5. Visibility: + public, - private, # protected
6. Relationships:
   - Inheritance: Parent <|-- Child
   - Composition: Container *-- Part
   - Aggregation: Whole o-- Part
   - Association: Class1 --> Class2
7. Labels: Class1 "1" --> "*" Class2 : has

EXAMPLE:
classDiagram
    class Document {{
        +String title
        +String content
        +Date createdAt
        +process() void
        +summarize() String
    }}

    class User {{
        +String name
        +String email
        +uploadDocument() Document
    }}

    class Quiz {{
        +String title
        +int score
        +generate() void
    }}

    User "1" --> "*" Document : uploads
    Document "1" --> "*" Quiz : generates

DOCUMENT CONTENT:
{content}

Generate ONLY valid Mermaid class diagram code. No explanations, no markdown blocks."""

            mermaid_code = self.gemini_client.generate_text(prompt, temperature=0.3)
            mermaid_code = self._clean_code(mermaid_code, "classDiagram")

            return {
                "success": True,
                "mermaid_code": mermaid_code,
                "title": title,
                "diagram_type": "class"
            }
        except Exception as e:
            logger.error(f"Class diagram generation error: {e}")
            return self._get_fallback("class", title, str(e))

    def _truncate_content(self, content: str, max_length: int = 15000) -> str:
        """Truncate content to fit in context"""
        if len(content) > max_length:
            content = content[:max_length] + "..."
            logger.info(f"Content truncated to {max_length} characters")
        return content

    def _clean_code(self, code: str, expected_start: str) -> str:
        """Clean and validate Mermaid code"""
        code = code.strip()

        # Remove markdown code blocks
        if code.startswith("```"):
            lines = code.split("\n")
            lines = [l for l in lines if not l.startswith("```")]
            code = "\n".join(lines)

        code = code.strip()

        # Ensure proper start
        if not code.startswith(expected_start):
            # Try to find the diagram start
            for line in code.split("\n"):
                if line.strip().startswith(expected_start):
                    idx = code.index(line)
                    code = code[idx:]
                    break
            else:
                # Add the expected start
                code = expected_start + "\n" + code

        return code

    def _get_fallback(self, diagram_type: str, title: str, error: str) -> Dict[str, Any]:
        """Return fallback diagram if generation fails"""
        safe_title = title.replace('"', '').replace("'", "")[:30]

        fallbacks = {
            "flowchart": f'''graph TB
    A["Start: {safe_title}"] --> B["Process Content"]
    B --> C{{"Analysis"}}
    C -->|"Success"| D["Generate Output"]
    C -->|"Retry"| B
    D --> E["Complete"]''',

            "sequence": f'''sequenceDiagram
    participant U as User
    participant S as System
    participant AI as AI Engine

    U->>S: Upload {safe_title}
    S->>AI: Process Content
    AI-->>S: Analysis Results
    S-->>U: Display Results''',

            "er": f'''erDiagram
    DOCUMENT {{
        int id PK
        string title
        string content
    }}
    CONCEPT {{
        int id PK
        string name
        string description
    }}
    DOCUMENT ||--o{{ CONCEPT : contains''',

            "state": f'''stateDiagram-v2
    [*] --> Uploaded
    Uploaded --> Processing: Analyze
    Processing --> Ready: Complete
    Processing --> Error: Failed
    Error --> Processing: Retry
    Ready --> [*]''',

            "class": f'''classDiagram
    class Document {{
        +String title
        +String content
        +analyze() void
    }}
    class Concept {{
        +String name
        +String definition
    }}
    Document "1" --> "*" Concept : contains'''
        }

        return {
            "success": False,
            "error": error,
            "mermaid_code": fallbacks.get(diagram_type, fallbacks["flowchart"]),
            "title": title,
            "diagram_type": diagram_type
        }


# Global instance
diagram_generator = DiagramGenerator()
