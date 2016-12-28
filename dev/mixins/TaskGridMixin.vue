<script>
import * as mutations from '../store/mutation-types';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';

import StandardTaskRow from "../components/Standard/StandardTaskRow.vue";
import StandardHeaderField from "../components/Standard/StandardHeaderField.vue";
import Paginator from 'vue-simple-pagination/VueSimplePagination.vue';

export default {
    name: 'task-grid-mixin',
    data() {
      return {
        state: {}
      }
    },
    props: {
    	parentState: {
    		type: Object,
    		default: null
    	},
    	config: {
    		type: Object
    	}
    },
    computed: {
    	currentTasks() {
        return this.state.tasksToShow;
      },
      currentPage() {
        return this.state.currentPage;
      },
      pageCount() {
        return Math.ceil(this.state.resultCount / this.state.resultsPerPage);
      },
      resultsPerPage() {
        return this.state.resultsPerPage;
      },
      isLoading() {
        return this.state.isLoading;
      },
      sortState() {
        return this.state.sortState;
      },
      header() {
        return this.config.tasktypes[this.config.header].fields;
      }
    },
    watch: {
      isLoading() {
        if(this.isLoading){
          NProgress.start();
        }
        else {
          NProgress.done();
        }
      },
      sortState() {
        this.fetchData();
      }
    },
    methods: {
      fetchData() {
        let request = {
          request: JSON.stringify({Parent: ""}),
          depth: 2,
          limit: this.resultsPerPage,
          offset: (this.currentPage -1 ) * this.resultsPerPage,
          order: this.sortState.field,
          desc: this.sortState.descending ? "1" : "",
          noHtml: 1
        };
        this.$store.dispatch('fetchTasks', {gridState: this.state, request});
      },
      changeCurrentPage(newPage) {
        this.$store.commit(mutations.SET_CURRENT_PAGE, {gridState: this.state, newPage});
        this.fetchData();
      },
      getTaskRow(task) {
        if(this.config.tasktypes[task.tasktype]){
          return this.config.tasktypes[task.tasktype].taskrow;
        }
        return this.config.tasktypes.default.taskrow;
      },
    },
    components: {
      StandardTaskRow,
      StandardHeaderField,
      Paginator
    },
    created() {
      let self = this;
      this.$store.dispatch('addGridState', {parentGridState: this.parentState, callback: function(state){
        self.state = state;
        self.fetchData();
      }});
    }
}
</script>
