<script>
import * as mutations from '../store/mutation-types';
import NProgress from 'nprogress';
import 'nprogress/nprogress.css';

export default {
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
          request: JSON.stringify({Context: this.config.context}),
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
      }
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
